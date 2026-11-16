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
import {
  attachSheetUrl,
  beaconSheet,
  hasProgressData,
  loadSheetSync,
  parseConnectionInput,
  readSheet,
  saveSheetSync,
  summarizeProgress,
  writeSheet,
  type SheetConnection,
  type SheetSnapshot,
  type SheetSummary,
  type SheetSyncState,
} from '../lib/sheets';

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

export type SheetPhase = 'disconnected' | 'idle' | 'syncing' | 'needs-decision' | 'error';

export interface SheetActionResult {
  ok: boolean;
  message: string;
  requiresDecision?: boolean;
  remote?: SheetSummary;
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
  recordLevelPosition: (level: CEFRLevel, index: number) => void;
  notify: (message: string, tone?: ToastMessage['tone']) => void;
  toast: ToastMessage | null;
  dismissToast: () => void;
  getCard: (wordId: string) => SRSCard | undefined;
  getPractice: (wordId: string) => string[];

  // Google Sheets
  sheetSync: SheetSyncState;
  sheetPhase: SheetPhase;
  sheetBusy: boolean;
  connectSheet: (input: {
    sheetUrl: string;
    endpoint: string;
    token: string;
  }) => Promise<SheetActionResult>;
  disconnectSheet: () => void;
  syncSheet: () => Promise<SheetActionResult>;
  pullSheet: (force?: boolean) => Promise<SheetActionResult>;
  pushSheet: (force?: boolean) => Promise<SheetActionResult>;
  resolveSheetConflict: (choice: 'pull' | 'push') => Promise<SheetActionResult>;
  flushSheet: () => void;
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

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong while talking to Google Sheets.';
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
  const markLocalChangeRef = useRef<() => void>(() => {});

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
    markLocalChangeRef.current();
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    markLocalChangeRef.current();
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

  // ---------------------------------------------------------------------------
  // Google Sheets sync. localStorage remains the offline cache; the sheet is
  // the shared copy. Every write carries the remote revision it was based on so
  // two devices cannot silently overwrite each other.
  // ---------------------------------------------------------------------------
  const [sheetSync, setSheetSync] = useState<SheetSyncState>(() => loadSheetSync());
  const [sheetBusy, setSheetBusy] = useState(false);
  // Every state update goes through patchSheet, which also refreshes this ref.
  const sheetRef = useRef(sheetSync);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const pushTimer = useRef<number | undefined>(undefined);
  const busyRef = useRef(false);
  const lastSheetCheck = useRef(0);
  const disconnectEpoch = useRef(0);

  const patchSheet = useCallback((patch: Partial<SheetSyncState>) => {
    const next = { ...sheetRef.current, ...patch };
    sheetRef.current = next;
    setSheetSync(next);
    saveSheetSync(next);
  }, []);

  const applySheetSnapshot = useCallback(
    (snapshot: SheetSnapshot, connection: SheetConnection | null) => {
      if (pushTimer.current) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = undefined;
      }
      // Credentials never travel through the sheet, so keep this device's keys.
      setSettings({
        ...snapshot.settings,
        geminiApiKey: settingsRef.current.geminiApiKey,
        openaiApiKey: settingsRef.current.openaiApiKey,
      });
      setProgress(snapshot.progress);
      const base = connection ?? sheetRef.current.connection;
      patchSheet({
        connection: base ? attachSheetUrl(base, snapshot.sheetUrl) : null,
        lastRemoteUpdatedAt: snapshot.updatedAt,
        lastSyncedAt: Date.now(),
        localChangedAt: snapshot.updatedAt,
        dirty: false,
        pendingDecision: false,
        remoteSummary: null,
        lastError: null,
      });
    },
    [patchSheet],
  );

  const performPush = useCallback(
    async (force: boolean): Promise<SheetActionResult> => {
      const current = sheetRef.current;
      if (!current.connection) return { ok: false, message: 'Connect a Google Sheet first.' };
      const connection = current.connection;
      const changedAt = current.localChangedAt;
      const isLive = () => sheetRef.current.connection?.endpoint === connection.endpoint;
      try {
        let result = await writeSheet(connection, {
          settings: settingsRef.current,
          progress: progressRef.current,
          deviceId: current.deviceId,
          baseUpdatedAt: force ? 0 : current.lastRemoteUpdatedAt,
        });

        if (!isLive()) {
          return { ok: false, message: 'The sheet was disconnected before the save finished.' };
        }

        if (result.conflict) {
          patchSheet({
            lastRemoteUpdatedAt: result.conflict.updatedAt,
            dirty: true,
            pendingDecision: true,
            remoteSummary: result.conflict.summary,
          });
          return {
            ok: false,
            requiresDecision: true,
            remote: result.conflict.summary,
            message: 'The sheet changed on another device. Choose which copy to keep.',
          };
        }

        const stillDirty = sheetRef.current.localChangedAt !== changedAt;
        const summary = summarizeProgress(progressRef.current);
        patchSheet({
          connection: attachSheetUrl(connection, result.sheetUrl),
          lastRemoteUpdatedAt: result.updatedAt,
          lastSyncedAt: Date.now(),
          localChangedAt: stillDirty ? sheetRef.current.localChangedAt : result.updatedAt,
          dirty: stillDirty,
          remoteSummary: null,
          lastError: null,
        });
        return {
          ok: true,
          message: `Saved ${summary.cards} ${summary.cards === 1 ? 'card' : 'cards'} to Google Sheets.`,
        };
      } catch (error) {
        const message = messageFromError(error);
        patchSheet({ lastError: message });
        return { ok: false, message };
      }
    },
    [patchSheet],
  );

  const pushSheet = useCallback(
    async (force = true): Promise<SheetActionResult> => {
      if (busyRef.current) return { ok: false, message: 'A sync is already running.' };
      busyRef.current = true;
      setSheetBusy(true);
      try {
        return await performPush(force);
      } finally {
        busyRef.current = false;
        setSheetBusy(false);
      }
    },
    [performPush],
  );

  const pullSheet = useCallback(
    async (force = true): Promise<SheetActionResult> => {
      const current = sheetRef.current;
      if (!current.connection) return { ok: false, message: 'Connect a Google Sheet first.' };
      if (busyRef.current) return { ok: false, message: 'A sync is already running.' };
      busyRef.current = true;
      setSheetBusy(true);
      try {
        const remote = await readSheet(current.connection);
        if (sheetRef.current.connection?.endpoint !== current.connection.endpoint) {
          return { ok: false, message: 'The sheet was disconnected before the import finished.' };
        }
        if (!remote.hasData) {
          return {
            ok: false,
            message: 'That sheet has no Wordloom data yet. Upload this device first.',
          };
        }
        if (!force && current.dirty && remote.updatedAt < current.localChangedAt) {
          return {
            ok: false,
            message: 'This device has newer changes that are not in the sheet yet.',
          };
        }
        applySheetSnapshot(remote.snapshot, current.connection);
        return {
          ok: true,
          message: `Imported ${remote.summary.cards} ${remote.summary.cards === 1 ? 'card' : 'cards'} from Google Sheets.`,
        };
      } catch (error) {
        const message = messageFromError(error);
        patchSheet({ lastError: message });
        return { ok: false, message };
      } finally {
        busyRef.current = false;
        setSheetBusy(false);
      }
    },
    [applySheetSnapshot, patchSheet],
  );

  const syncSheet = useCallback(async (): Promise<SheetActionResult> => {
    const current = sheetRef.current;
    if (!current.connection) return { ok: false, message: 'Connect a Google Sheet first.' };
    if (current.pendingDecision) {
      return { ok: false, message: 'Choose which copy to keep first.', requiresDecision: true };
    }
    if (busyRef.current) return { ok: false, message: 'A sync is already running.' };
    busyRef.current = true;
    setSheetBusy(true);
    try {
      const remote = await readSheet(current.connection);
      if (sheetRef.current.connection?.endpoint !== current.connection.endpoint) {
        return { ok: false, message: 'The sheet was disconnected before the sync finished.' };
      }
      const connection = attachSheetUrl(current.connection, remote.sheetUrl);
      const dirty = sheetRef.current.dirty;
      const remoteChanged =
        remote.hasData && remote.updatedAt > sheetRef.current.lastRemoteUpdatedAt;

      // Never let a device with no study data silently erase a populated sheet.
      if (dirty && remote.hasData && !hasProgressData(progressRef.current)) {
        patchSheet({
          connection,
          lastRemoteUpdatedAt: remote.updatedAt,
          localChangedAt: Math.max(sheetRef.current.localChangedAt, Date.now()),
          pendingDecision: true,
          remoteSummary: remote.summary,
          lastError: null,
        });
        return {
          ok: false,
          requiresDecision: true,
          remote: remote.summary,
          message:
            'This device has no study progress, but the sheet does. Choose which copy to keep.',
        };
      }

      if (!remote.hasData) {
        patchSheet({ connection, lastError: null });
        if (hasProgressData(progressRef.current) || dirty) return await performPush(true);
        return { ok: true, message: 'Connected. The sheet is ready when you study.' };
      }

      if (!hasProgressData(progressRef.current) && !dirty) {
        applySheetSnapshot(remote.snapshot, connection);
        return {
          ok: true,
          message: `Imported ${remote.summary.cards} ${remote.summary.cards === 1 ? 'card' : 'cards'} from Google Sheets.`,
        };
      }

      if (!remoteChanged && !dirty) {
        patchSheet({ connection, lastSyncedAt: Date.now(), lastError: null });
        return { ok: true, message: 'Everything is up to date.' };
      }

      if (!dirty) {
        applySheetSnapshot(remote.snapshot, connection);
        return {
          ok: true,
          message: `Updated from the sheet (${remote.summary.cards} ${remote.summary.cards === 1 ? 'card' : 'cards'}).`,
        };
      }

      if (!remoteChanged) return await performPush(false);

      // Both sides changed since the last sync. Do not guess with clocks.
      patchSheet({
        lastRemoteUpdatedAt: remote.updatedAt,
        pendingDecision: true,
        remoteSummary: remote.summary,
        lastError: null,
      });
      return {
        ok: false,
        requiresDecision: true,
        remote: remote.summary,
        message: 'This device and the sheet both changed. Choose which copy to keep.',
      };
    } catch (error) {
      const message = messageFromError(error);
      patchSheet({ lastError: message });
      return { ok: false, message };
    } finally {
      busyRef.current = false;
      setSheetBusy(false);
    }
  }, [applySheetSnapshot, patchSheet, performPush]);

  const connectSheet = useCallback(
    async (input: {
      sheetUrl: string;
      endpoint: string;
      token: string;
    }): Promise<SheetActionResult> => {
      const parsed = parseConnectionInput(input);
      if (!parsed.connection) {
        return { ok: false, message: parsed.error ?? 'That link could not be read.' };
      }
      if (busyRef.current) return { ok: false, message: 'A sync is already running.' };
      busyRef.current = true;
      setSheetBusy(true);
      try {
        const epoch = disconnectEpoch.current;
        const remote = await readSheet(parsed.connection);
        if (disconnectEpoch.current !== epoch) {
          return { ok: false, message: 'Connection cancelled.' };
        }
        const connection = attachSheetUrl(parsed.connection, remote.sheetUrl);
        const existing = sheetRef.current;
        patchSheet({ connection, lastError: null });

        if (
          remote.hasData &&
          existing.connection?.endpoint === connection.endpoint &&
          remote.updatedAt === existing.lastRemoteUpdatedAt &&
          !existing.dirty
        ) {
          patchSheet({ lastSyncedAt: Date.now() });
          return { ok: true, message: 'Connected. Everything is up to date.' };
        }
        if (!remote.hasData) {
          patchSheet({
            dirty: true,
            localChangedAt: Date.now(),
            pendingDecision: false,
            remoteSummary: null,
          });
          const result = await performPush(true);
          return {
            ok: result.ok,
            message: result.ok
              ? 'Connected. Uploaded this device’s progress to the sheet.'
              : result.message,
          };
        }

        if (!hasProgressData(progressRef.current)) {
          applySheetSnapshot(remote.snapshot, connection);
          return {
            ok: true,
            message: `Connected and imported ${remote.summary.cards} ${remote.summary.cards === 1 ? 'card' : 'cards'}.`,
          };
        }

        patchSheet({
          lastRemoteUpdatedAt: remote.updatedAt,
          localChangedAt: Math.max(sheetRef.current.localChangedAt, Date.now()),
          pendingDecision: true,
          remoteSummary: remote.summary,
          lastError: null,
        });
        return {
          ok: true,
          requiresDecision: true,
          remote: remote.summary,
          message: 'Connected. The sheet already has data — choose which copy to keep.',
        };
      } catch (error) {
        const message = messageFromError(error);
        patchSheet({ lastError: message });
        return { ok: false, message };
      } finally {
        busyRef.current = false;
        setSheetBusy(false);
      }
    },
    [applySheetSnapshot, patchSheet, performPush],
  );

  const disconnectSheet = useCallback(() => {
    disconnectEpoch.current += 1;
    if (pushTimer.current) {
      window.clearTimeout(pushTimer.current);
      pushTimer.current = undefined;
    }
    patchSheet({
      connection: null,
      lastRemoteUpdatedAt: 0,
      lastSyncedAt: null,
      lastError: null,
      dirty: false,
      localChangedAt: 0,
      pendingDecision: false,
      remoteSummary: null,
    });
  }, [patchSheet]);

  const resolveSheetConflict = useCallback(
    async (choice: 'pull' | 'push'): Promise<SheetActionResult> => {
      patchSheet({ pendingDecision: false });
      const result = choice === 'pull' ? await pullSheet(true) : await pushSheet(true);
      if (!result.ok) patchSheet({ pendingDecision: true });
      return result;
    },
    [patchSheet, pullSheet, pushSheet],
  );

  /** Mark a local edit and schedule an upload a couple of seconds later. */
  const markLocalChange = useCallback(() => {
    if (!sheetRef.current.connection) return;
    patchSheet({ dirty: true, localChangedAt: Date.now() });
    if (sheetRef.current.pendingDecision) return;
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = undefined;
      void pushSheet(false);
    }, 8000);
  }, [patchSheet, pushSheet]);

  markLocalChangeRef.current = markLocalChange;

  const flushSheet = useCallback(() => {
    const current = sheetRef.current;
    if (!current.connection || !current.dirty || current.pendingDecision) return;
    beaconSheet(current.connection, {
      settings: settingsRef.current,
      progress: progressRef.current,
      deviceId: current.deviceId,
      baseUpdatedAt: current.lastRemoteUpdatedAt,
    });
  }, []);

  // Sync once when a connection appears, and check again when the tab returns.
  const autoSyncRef = useRef(syncSheet);
  autoSyncRef.current = syncSheet;
  useEffect(() => {
    if (!sheetSync.connection) return;
    const timer = window.setTimeout(() => {
      lastSheetCheck.current = Date.now();
      if (!sheetRef.current.pendingDecision) void autoSyncRef.current();
    }, 600);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSheetCheck.current < 60_000) return;
      lastSheetCheck.current = Date.now();
      if (!sheetRef.current.pendingDecision) void autoSyncRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sheetSync.connection?.endpoint]);

  useEffect(
    () => () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    },
    [],
  );

  const decisionNoticed = useRef(false);
  useEffect(() => {
    if (!sheetSync.pendingDecision) {
      decisionNoticed.current = false;
      return;
    }
    if (decisionNoticed.current) return;
    decisionNoticed.current = true;
    notify('A Google Sheet connection needs a choice. Open Settings → Google Sheets.', 'info');
  }, [sheetSync.pendingDecision, notify]);

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
      flushSheet();
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
  }, [progress, flushSheet]);

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
      markLocalChange();
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
    [notify, progress.cards, settings.learningStepMinutes, srsConfig, markLocalChange],
  );

  const gradeCard = useCallback(
    (wordId: string, grade: ReviewGrade) => {
      const now = Date.now();
      markLocalChange();
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
    [srsConfig, markLocalChange],
  );

  const setResponse = useCallback((wordId: string, exerciseKey: string, text: string) => {
    const key = `${wordId}::${exerciseKey}`;
    markLocalChange();
    setProgress((current) => ({
      ...current,
      responses: { ...current.responses, [key]: text },
    }));
  }, [markLocalChange]);

  const setSolution = useCallback((wordId: string, exerciseKey: string, solution: string) => {
    const key = `${wordId}::${exerciseKey}`;
    markLocalChange();
    setProgress((current) => ({
      ...current,
      solutions: { ...current.solutions, [key]: solution },
    }));
  }, [markLocalChange]);

  const addGeneratedExercises = useCallback(
    (wordId: string, examples: ExampleSentence[], sentences: string[]) => {
      markLocalChange();
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
    [markLocalChange],
  );

  const importBackup = useCallback(
    (backup: Pick<BackupFile, 'settings' | 'progress'>) => {
      setSettings(backup.settings);
      setProgress(backup.progress);
      markLocalChange();
      notify('Backup imported. Your settings and progress are restored.');
    },
    [notify, markLocalChange],
  );

  const exportBackup = useCallback(
    () => buildBackup(settings, progress),
    [settings, progress],
  );

  const resetProgress = useCallback(() => {
    setProgress(emptyProgress());
    markLocalChange();
    notify('Study progress and generated exercises cleared. Your vocabulary and settings are untouched.', 'info');
  }, [notify, markLocalChange]);

  const recordLevelPosition = useCallback(
    (level: CEFRLevel, index: number) => {
      if (!Number.isFinite(index) || index < 0) return;
      if (progressRef.current.levelPositions[level] === index) return;
      markLocalChange();
      setProgress((current) => ({
        ...current,
        levelPositions: { ...current.levelPositions, [level]: index },
      }));
    },
    [markLocalChange],
  );

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

  const sheetPhase: SheetPhase = !sheetSync.connection
    ? 'disconnected'
    : sheetSync.pendingDecision
      ? 'needs-decision'
      : sheetBusy
        ? 'syncing'
        : sheetSync.lastError
          ? 'error'
          : 'idle';

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
    recordLevelPosition,
    notify,
    toast,
    dismissToast,
    getCard,
    getPractice,
    sheetSync,
    sheetPhase,
    sheetBusy,
    connectSheet,
    disconnectSheet,
    syncSheet,
    pullSheet,
    pushSheet,
    resolveSheetConflict,
    flushSheet,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppProvider.');
  return context;
}
