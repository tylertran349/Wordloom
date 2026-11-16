import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  BackupFile,
  CEFRLevel,
  ExampleSentence,
  ProgressState,
  ReviewGrade,
  Settings,
  SRSCard,
  ToastMessage,
} from '../types';
import { CEFR_LEVELS } from '../types';
import { ALL_WORDS, LEVEL_WORDS, WORD_BY_ID } from '../data/vocabulary';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  buildBackup,
  emptyProgress,
  loadProgress,
  loadSettings,
  parseStoredProgress,
  parseStoredSettings,
  saveProgress,
  saveSettings,
} from '../lib/storage';
import { createCard, isDue, scheduleCard } from '../lib/srs';
import { dayKey, endOfDay, formatInterval, getPracticeSentences } from '../lib/utils';

export interface LevelStat {
  level: CEFRLevel;
  total: number;
  studied: number;
  due: number;
  mastered: number;
  percent: number;
}

export interface AppStats {
  studied: number;
  dueNow: number;
  dueToday: number;
  mastered: number;
  learning: number;
  totalReviews: number;
  strongRecall: number;
  streak: number;
  studiedToday: number;
  reviewedToday: number;
  practicedToday: number;
  newToday: number;
  nextDue: number | null;
  levelStats: LevelStat[];
}

interface AppContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  progress: ProgressState;
  stats: AppStats;
  dueWords: typeof ALL_WORDS;
  studiedWords: typeof ALL_WORDS;
  markStudied: (wordId: string) => boolean;
  gradeCard: (wordId: string, grade: ReviewGrade) => void;
  setResponse: (wordId: string, exerciseKey: string, text: string) => void;
  setSolution: (wordId: string, exerciseKey: string, solution: string) => void;
  addGeneratedExercises: (
    wordId: string,
    examples: ExampleSentence[],
    sentences: string[],
  ) => void;
  importBackup: (backup: Pick<BackupFile, 'settings' | 'progress'>) => void;
  exportBackup: () => BackupFile;
  resetProgress: () => void;
  notify: (message: string, tone?: ToastMessage['tone']) => void;
  toast: ToastMessage | null;
  dismissToast: () => void;
  getCard: (wordId: string) => SRSCard | undefined;
  getPractice: (wordId: string) => string[];
}

const AppContext = createContext<AppContextValue | null>(null);

function withActivity(
  activity: ProgressState['activity'],
  field: 'studied' | 'reviews',
  timestamp = Date.now(),
): ProgressState['activity'] {
  const key = dayKey(timestamp);
  const current = activity[key] ?? { studied: 0, reviews: 0 };
  return {
    ...activity,
    [key]: { ...current, [field]: current[field] + 1 },
  };
}

function computeStreak(activity: ProgressState['activity']): number {
  const today = new Date();
  const hasToday = (activity[dayKey(today)]?.studied ?? 0) + (activity[dayKey(today)]?.reviews ?? 0) > 0;
  const cursor = new Date(today);
  if (!hasToday) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  for (let index = 0; index < 3650; index += 1) {
    const entry = activity[dayKey(cursor)];
    if (!entry || entry.studied + entry.reviews <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeStats(progress: ProgressState, now = Date.now()): AppStats {
  const today = dayKey(now);
  const dayEnd = endOfDay(now).getTime();
  const cards = Object.values(progress.cards).filter((card) => Boolean(WORD_BY_ID[card.wordId]));
  const todayActivity = progress.activity[today] ?? { studied: 0, reviews: 0 };

  const levelStats = CEFR_LEVELS.map((level) => {
    const words = LEVEL_WORDS[level];
    const levelCards = words
      .map((word) => progress.cards[word.id])
      .filter((card): card is SRSCard => Boolean(card));
    const studied = levelCards.length;
    return {
      level,
      total: words.length,
      studied,
      due: levelCards.filter((card) => isDue(card, now)).length,
      mastered: levelCards.filter((card) => card.status === 'mastered').length,
      percent: words.length ? Math.round((studied / words.length) * 100) : 0,
    };
  });

  const nextDue =
    cards.length > 0
      ? Math.min(...cards.map((card) => card.due))
      : null;

  const studiedToday = todayActivity.studied;
  const reviewedToday = todayActivity.reviews;
  const newToday = cards.filter((card) => dayKey(card.createdAt) === today).length;

  return {
    studied: cards.length,
    dueNow: cards.filter((card) => isDue(card, now)).length,
    dueToday: cards.filter((card) => card.due <= dayEnd).length,
    mastered: cards.filter((card) => card.status === 'mastered').length,
    learning: cards.filter((card) => card.status === 'learning').length,
    totalReviews: progress.reviewCount,
    strongRecall: progress.reviewCount
      ? Math.round((progress.strongReviewCount / progress.reviewCount) * 100)
      : 0,
    streak: computeStreak(progress.activity),
    studiedToday,
    reviewedToday,
    practicedToday: studiedToday + reviewedToday,
    newToday,
    nextDue,
    levelStats,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [clock, setClock] = useState(() => Date.now());
  const remoteSettings = useRef(false);
  const remoteProgress = useRef(false);
  const storageWarned = useRef(false);

  useEffect(() => {
    const tick = () => setClock(Date.now());
    const interval = window.setInterval(tick, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const notify = useCallback((message: string, tone: ToastMessage['tone'] = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const reportStorageFailure = useCallback(() => {
    if (storageWarned.current) return;
    storageWarned.current = true;
    notify(
      'Browser storage is unavailable or full. Changes may not survive a reload — export a backup.',
      'error',
    );
  }, [notify]);

  useEffect(() => {
    if (remoteSettings.current) {
      remoteSettings.current = false;
      return;
    }
    if (!saveSettings(settings)) reportStorageFailure();
  }, [settings, reportStorageFailure]);

  useEffect(() => {
    if (remoteProgress.current) {
      remoteProgress.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (!saveProgress(progress)) reportStorageFailure();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [progress, reportStorageFailure]);

  // Keep tabs in sync. The remote flags prevent a write-back loop: applying a
  // value from another tab must not trigger another save here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.SETTINGS_KEY && event.newValue) {
        try {
          const incoming = parseStoredSettings(event.newValue);
          remoteSettings.current = true;
          setSettings(incoming);
        } catch {
          // Ignore malformed writes from another tab.
        }
      } else if (event.key === STORAGE_KEYS.PROGRESS_KEY && event.newValue) {
        try {
          const incoming = parseStoredProgress(event.newValue);
          remoteProgress.current = true;
          setProgress(incoming);
        } catch {
          // Ignore malformed writes from another tab.
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const flush = () => {
      saveProgress(progress);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [progress]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme;
      root.dataset.theme = resolved;
      root.dataset.accent = settings.accent;
      root.style.setProperty('--font-scale', String(settings.fontScale));
      root.classList.toggle('reduce-motion', settings.reduceMotion);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#101512' : '#f6f4ef');
    };
    apply();
    if (settings.theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [settings.theme, settings.accent, settings.fontScale, settings.reduceMotion]);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const srsConfig = useMemo(
    () => ({
      startingEase: settings.startingEase,
      easyBonus: settings.easyBonus,
      hardMultiplier: settings.hardMultiplier,
      maxIntervalDays: settings.maxIntervalDays,
      learningStepMinutes: settings.learningStepMinutes,
    }),
    [
      settings.startingEase,
      settings.easyBonus,
      settings.hardMultiplier,
      settings.maxIntervalDays,
      settings.learningStepMinutes,
    ],
  );

  const markStudied = useCallback(
    (wordId: string): boolean => {
      if (progress.cards[wordId]) {
        notify('This word is already in your review queue.', 'info');
        return false;
      }
      const now = Date.now();
      setProgress((current) => {
        if (current.cards[wordId]) return current;
        return {
          ...current,
          cards: {
            ...current.cards,
            [wordId]: createCard(wordId, srsConfig, now),
          },
          lastStudied: { wordId, at: now },
          activity: withActivity(current.activity, 'studied', now),
        };
      });
      notify(
        `Added to your review queue. First check-in in ${formatInterval(
          settings.learningStepMinutes / 1440,
        )}.`,
      );
      return true;
    },
    [notify, progress.cards, settings.learningStepMinutes, srsConfig],
  );

  const gradeCard = useCallback(
    (wordId: string, grade: ReviewGrade) => {
      const now = Date.now();
      setProgress((current) => {
        const existing = current.cards[wordId] ?? createCard(wordId, srsConfig, now);
        const scheduled = scheduleCard(existing, grade, srsConfig, now);
        return {
          ...current,
          cards: { ...current.cards, [wordId]: scheduled },
          lastStudied: { wordId, at: now },
          activity: withActivity(current.activity, 'reviews', now),
          reviewCount: current.reviewCount + 1,
          strongReviewCount:
            current.strongReviewCount + (grade === 'good' || grade === 'easy' ? 1 : 0),
          reviewLog: [
            {
              wordId,
              grade,
              at: now,
              interval: scheduled.interval,
            },
            ...current.reviewLog,
          ].slice(0, 500),
        };
      });
    },
    [srsConfig],
  );

  const setResponse = useCallback((wordId: string, exerciseKey: string, text: string) => {
    const key = `${wordId}::${exerciseKey}`;
    setProgress((current) => ({
      ...current,
      responses: { ...current.responses, [key]: text },
    }));
  }, []);

  const setSolution = useCallback((wordId: string, exerciseKey: string, solution: string) => {
    const key = `${wordId}::${exerciseKey}`;
    setProgress((current) => ({
      ...current,
      solutions: { ...current.solutions, [key]: solution },
    }));
  }, []);

  const addGeneratedExercises = useCallback(
    (wordId: string, examples: ExampleSentence[], sentences: string[]) => {
      setProgress((current) => {
        const existingSentences = current.generatedPractice[wordId] ?? [];
        const mergedSentences = Array.from(new Set([...existingSentences, ...sentences]));

        const existingExamples = current.generatedExamples[wordId] ?? [];
        const seen = new Set(
          existingExamples.map((example) => example.target.trim().toLowerCase()),
        );
        const mergedExamples = [...existingExamples];
        examples.forEach((example) => {
          const key = example.target.trim().toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          mergedExamples.push(example);
        });

        return {
          ...current,
          generatedExamples: { ...current.generatedExamples, [wordId]: mergedExamples },
          generatedPractice: { ...current.generatedPractice, [wordId]: mergedSentences },
        };
      });
    },
    [],
  );

  const importBackup = useCallback(
    (backup: Pick<BackupFile, 'settings' | 'progress'>) => {
      setSettings(backup.settings);
      setProgress(backup.progress);
      notify('Backup imported. Your settings and progress are restored.');
    },
    [notify],
  );

  const exportBackup = useCallback(
    () => buildBackup(settings, progress),
    [settings, progress],
  );

  const resetProgress = useCallback(() => {
    setProgress(emptyProgress());
    notify('Study progress and generated exercises cleared. Your vocabulary and settings are untouched.', 'info');
  }, [notify]);

  const stats = useMemo(() => computeStats(progress, clock), [progress, clock]);

  const dueWords = useMemo(
    () =>
      ALL_WORDS.filter((word) => isDue(progress.cards[word.id], clock)).sort(
        (a, b) => (progress.cards[a.id]?.due ?? 0) - (progress.cards[b.id]?.due ?? 0),
      ),
    [progress.cards, clock],
  );

  const studiedWords = useMemo(
    () =>
      ALL_WORDS.filter((word) => Boolean(progress.cards[word.id])).sort(
        (a, b) => (progress.cards[a.id]?.due ?? 0) - (progress.cards[b.id]?.due ?? 0),
      ),
    [progress.cards],
  );

  const getPractice = useCallback(
    (wordId: string) => {
      const word = WORD_BY_ID[wordId];
      if (!word) return [];
      return getPracticeSentences(
        Math.max(20, settings.exercisesPerWord),
        progress.generatedPractice[wordId] ?? [],
      );
    },
    [progress.generatedPractice, settings.exercisesPerWord],
  );

  const getCard = useCallback(
    (wordId: string) => progress.cards[wordId],
    [progress.cards],
  );

  const value: AppContextValue = {
    settings,
    updateSettings,
    resetSettings,
    progress,
    stats,
    dueWords,
    studiedWords,
    markStudied,
    gradeCard,
    setResponse,
    setSolution,
    addGeneratedExercises,
    importBackup,
    exportBackup,
    resetProgress,
    notify,
    toast,
    dismissToast,
    getCard,
    getPractice,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppProvider.');
  return context;
}
