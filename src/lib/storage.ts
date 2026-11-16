import type {
  BackupFile,
  DayActivity,
  ProgressState,
  ReviewGrade,
  ReviewLogEntry,
  Settings,
  SRSCard,
} from '../types';
import { LANGUAGES } from '../data/languages';
import { clamp } from './utils';

const SETTINGS_KEY = 'wordloom.settings.v1';
const PROGRESS_KEY = 'wordloom.progress.v1';

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  targetLanguage: 'vi',
  nativeLanguage: 'en',
  dailyGoal: 10,
  newWordsPerDay: 8,
  maxReviewsPerDay: 60,

  theme: 'light',
  accent: 'jade',
  fontScale: 1,
  reduceMotion: false,

  exercisesPerWord: 5,
  showPronunciation: true,
  showPartOfSpeech: true,
  showExampleTranslations: true,
  showExerciseHints: true,
  autoplayAudio: false,
  ttsRate: 0.9,

  startingEase: 2.5,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  maxIntervalDays: 365,
  learningStepMinutes: 10,
  reviewShowExample: true,
  reviewExercise: true,

  googleTranslateEnabled: true,
  autoRevealSolutions: false,
  showTranslateLink: false,

  aiProvider: 'gemini',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  geminiThinking: 'auto',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  openaiThinking: 'auto',
  temperature: 0.7,
  aiFeedback: true,
  aiExercises: true,
};

export function emptyProgress(): ProgressState {
  return {
    version: 1,
    cards: {},
    responses: {},
    solutions: {},
    generatedPractice: {},
    activity: {},
    reviewLog: [],
    reviewCount: 0,
    strongReviewCount: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return fallback;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asLanguage(value: unknown, fallback: string): string {
  const code = asString(value, fallback);
  return LANGUAGES.some((language) => language.code === code) ? code : fallback;
}

function normalizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const defaults = DEFAULT_SETTINGS;

  const theme = source.theme;
  const accent = source.accent;
  const provider = source.aiProvider;
  const thinking = source.geminiThinking;
  const openaiThinking = source.openaiThinking;
  const googleTranslateEnabled = asBoolean(
    source.googleTranslateEnabled,
    defaults.googleTranslateEnabled,
  );

  return {
    displayName: asString(source.displayName).slice(0, 40),
    targetLanguage: asLanguage(source.targetLanguage, defaults.targetLanguage),
    nativeLanguage: asLanguage(source.nativeLanguage, defaults.nativeLanguage),
    dailyGoal: Math.round(asNumber(source.dailyGoal, defaults.dailyGoal, 1, 50)),
    newWordsPerDay: Math.round(asNumber(source.newWordsPerDay, defaults.newWordsPerDay, 1, 30)),
    maxReviewsPerDay: Math.round(
      asNumber(source.maxReviewsPerDay, defaults.maxReviewsPerDay, 5, 150),
    ),

    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : defaults.theme,
    accent:
      accent === 'jade' ||
      accent === 'indigo' ||
      accent === 'coral' ||
      accent === 'amber' ||
      accent === 'violet'
        ? accent
        : defaults.accent,
    fontScale: asNumber(source.fontScale, defaults.fontScale, 0.9, 1.2),
    reduceMotion: asBoolean(source.reduceMotion, defaults.reduceMotion),

    exercisesPerWord: Math.round(
      asNumber(source.exercisesPerWord, defaults.exercisesPerWord, 3, 10),
    ),
    showPronunciation: asBoolean(source.showPronunciation, defaults.showPronunciation),
    showPartOfSpeech: asBoolean(source.showPartOfSpeech, defaults.showPartOfSpeech),
    showExampleTranslations: asBoolean(
      source.showExampleTranslations,
      defaults.showExampleTranslations,
    ),
    showExerciseHints: asBoolean(source.showExerciseHints, defaults.showExerciseHints),
    autoplayAudio: asBoolean(source.autoplayAudio, defaults.autoplayAudio),
    ttsRate: asNumber(source.ttsRate, defaults.ttsRate, 0.5, 1.3),

    startingEase: asNumber(source.startingEase, defaults.startingEase, 1.3, 3.5),
    easyBonus: asNumber(source.easyBonus, defaults.easyBonus, 1, 2),
    hardMultiplier: asNumber(source.hardMultiplier, defaults.hardMultiplier, 1, 2),
    maxIntervalDays: Math.round(
      asNumber(source.maxIntervalDays, defaults.maxIntervalDays, 30, 3650),
    ),
    learningStepMinutes: Math.round(
      asNumber(source.learningStepMinutes, defaults.learningStepMinutes, 1, 180),
    ),
    reviewShowExample: asBoolean(source.reviewShowExample, defaults.reviewShowExample),
    reviewExercise: asBoolean(source.reviewExercise, defaults.reviewExercise),

    googleTranslateEnabled,
    autoRevealSolutions:
      googleTranslateEnabled &&
      asBoolean(source.autoRevealSolutions, defaults.autoRevealSolutions),
    showTranslateLink: asBoolean(source.showTranslateLink, defaults.showTranslateLink),

    aiProvider: provider === 'openai' ? 'openai' : 'gemini',
    geminiApiKey: asString(source.geminiApiKey),
    geminiModel: asString(source.geminiModel, defaults.geminiModel),
    geminiThinking:
      thinking === 'auto' ||
      thinking === 'minimal' ||
      thinking === 'low' ||
      thinking === 'medium' ||
      thinking === 'high'
        ? thinking
        : defaults.geminiThinking,
    openaiBaseUrl: asString(source.openaiBaseUrl, defaults.openaiBaseUrl),
    openaiApiKey: asString(source.openaiApiKey),
    openaiModel: asString(source.openaiModel, defaults.openaiModel),
    openaiThinking:
      openaiThinking === 'auto' ||
      openaiThinking === 'none' ||
      openaiThinking === 'minimal' ||
      openaiThinking === 'low' ||
      openaiThinking === 'medium' ||
      openaiThinking === 'high'
        ? openaiThinking
        : defaults.openaiThinking,
    temperature: asNumber(source.temperature, defaults.temperature, 0, 2),
    aiFeedback: asBoolean(source.aiFeedback, defaults.aiFeedback),
    aiExercises: asBoolean(source.aiExercises, defaults.aiExercises),
  };
}

function normalizeCard(raw: unknown): SRSCard | null {
  if (!isRecord(raw) || typeof raw.wordId !== 'string') return null;
  const now = Date.now();
  const status: SRSCard['status'] =
    raw.status === 'learning' || raw.status === 'review' || raw.status === 'mastered'
      ? raw.status
      : 'learning';
  return {
    wordId: raw.wordId,
    ease: asNumber(raw.ease, 2.5, 1.3, 3.5),
    interval: asNumber(raw.interval, 0, 1 / 1440, 3650),
    repetitions: Math.round(asNumber(raw.repetitions, 0, 0, 10_000)),
    lapses: Math.round(asNumber(raw.lapses, 0, 0, 10_000)),
    due: asNumber(raw.due, now, 0, Number.MAX_SAFE_INTEGER),
    createdAt: asNumber(raw.createdAt, now, 0, Number.MAX_SAFE_INTEGER),
    lastReviewed:
      typeof raw.lastReviewed === 'number' ? raw.lastReviewed : undefined,
    totalReviews: Math.round(asNumber(raw.totalReviews, 0, 0, 100_000)),
    status,
  };
}

function normalizeProgress(raw: unknown): ProgressState {
  if (!isRecord(raw)) return emptyProgress();

  const cards: Record<string, SRSCard> = {};
  if (isRecord(raw.cards)) {
    Object.values(raw.cards).forEach((value) => {
      const card = normalizeCard(value);
      if (card) cards[card.wordId] = card;
    });
  }

  const stringRecord = (value: unknown): Record<string, string> => {
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  };

  const generatedPractice: Record<string, string[]> = {};
  if (isRecord(raw.generatedPractice)) {
    Object.entries(raw.generatedPractice).forEach(([wordId, sentences]) => {
      if (Array.isArray(sentences)) {
        generatedPractice[wordId] = sentences.filter(
          (sentence): sentence is string => typeof sentence === 'string',
        );
      }
    });
  }

  const activity: Record<string, DayActivity> = {};
  if (isRecord(raw.activity)) {
    Object.entries(raw.activity).forEach(([key, value]) => {
      if (!isRecord(value)) return;
      activity[key] = {
        studied: Math.round(asNumber(value.studied, 0, 0, 100_000)),
        reviews: Math.round(asNumber(value.reviews, 0, 0, 100_000)),
      };
    });
  }

  const reviewLog: ReviewLogEntry[] = [];
  if (Array.isArray(raw.reviewLog)) {
    raw.reviewLog.forEach((value) => {
      if (!isRecord(value) || typeof value.wordId !== 'string') return;
      const grade = value.grade;
      if (grade !== 'again' && grade !== 'hard' && grade !== 'good' && grade !== 'easy') return;
      reviewLog.push({
        wordId: value.wordId,
        grade: grade as ReviewGrade,
        at: asNumber(value.at, Date.now(), 0, Number.MAX_SAFE_INTEGER),
        interval: asNumber(value.interval, 0, 0, 3650),
      });
    });
  }

  const lastStudied = isRecord(raw.lastStudied) && typeof raw.lastStudied.wordId === 'string'
    ? {
        wordId: raw.lastStudied.wordId,
        at: asNumber(raw.lastStudied.at, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      }
    : undefined;

  const strongFromLog = reviewLog.filter(
    (entry) => entry.grade === 'good' || entry.grade === 'easy',
  ).length;
  const reviewCount = Math.max(
    reviewLog.length,
    Math.round(asNumber(raw.reviewCount, reviewLog.length, 0, 10_000_000)),
  );
  const strongReviewCount = Math.min(
    reviewCount,
    Math.max(
      strongFromLog,
      Math.round(asNumber(raw.strongReviewCount, strongFromLog, 0, 10_000_000)),
    ),
  );

  return {
    version: 1,
    cards,
    responses: stringRecord(raw.responses),
    solutions: stringRecord(raw.solutions),
    generatedPractice,
    activity,
    reviewLog: reviewLog.slice(0, 500),
    reviewCount,
    strongReviewCount,
    lastStudied,
  };
}

export function parseStoredSettings(raw: string): Settings {
  return normalizeSettings(JSON.parse(raw));
}

export function parseStoredProgress(raw: string): ProgressState {
  return normalizeProgress(JSON.parse(raw));
}

function preserveCorruptValue(key: string): void {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) window.localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw);
  } catch {
    // If storage itself is unavailable, there is nothing else to preserve.
  }
}

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseStoredSettings(raw);
  } catch {
    preserveCorruptValue(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): boolean {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    // A full or unavailable storage quota should never break the app.
    return false;
  }
}

export function loadProgress(): ProgressState {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    return parseStoredProgress(raw);
  } catch {
    preserveCorruptValue(PROGRESS_KEY);
    return emptyProgress();
  }
}

export function saveProgress(progress: ProgressState): boolean {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    // The session still works in memory; the provider reports the failure.
    return false;
  }
}

export function clearStoredData(which: 'settings' | 'progress' | 'both' = 'both'): void {
  try {
    if (which === 'settings' || which === 'both') {
      window.localStorage.removeItem(SETTINGS_KEY);
    }
    if (which === 'progress' || which === 'both') {
      window.localStorage.removeItem(PROGRESS_KEY);
    }
  } catch {
    // No-op.
  }
}

export function clearAllWordloomStorage(): void {
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('wordloom.'))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // No-op.
  }
}

export function buildBackup(settings: Settings, progress: ProgressState): BackupFile {
  return {
    app: 'wordloom',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    progress,
  };
}

export function parseBackup(raw: string): { settings: Settings; progress: ProgressState } {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || parsed.app !== 'wordloom') {
    throw new Error('This file does not look like a Wordloom backup.');
  }
  return {
    settings: normalizeSettings(parsed.settings),
    progress: normalizeProgress(parsed.progress),
  };
}

export function getStorageFootprint(settings: Settings, progress: ProgressState): number {
  try {
    return new Blob([JSON.stringify(settings), JSON.stringify(progress)]).size;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const STORAGE_KEYS = { SETTINGS_KEY, PROGRESS_KEY };
