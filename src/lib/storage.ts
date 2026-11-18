import type {
  BackupFile,
  CustomWord,
  DayActivity,
  ExampleSentence,
  ProgressState,
  ReviewGrade,
  ReviewLogEntry,
  Settings,
  SRSCard,
  WordEdit,
} from '../types';
import { LANGUAGES } from '../data/languages';
import { CEFR_LEVELS } from '../types';
import { clamp } from './utils';
import {
  createCustomWordId,
  MAX_CUSTOM_WORDS,
  normalizeTermKey,
} from './wordImport';

const SETTINGS_KEY = 'wordloom.settings.v1';
const PROGRESS_KEY = 'wordloom.progress.v1';

/**
 * Local data is mirrored per profile. The blank profile is the local-only
 * copy; an email keeps that learner's offline cache separate when somebody
 * else signs in on the same browser.
 */
export function storageKeyForProfile(base: string, profile = ''): string {
  const clean = profile.trim().toLowerCase();
  return clean ? `${base}::${clean}` : base;
}

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
  newWordOrder: 'random',
  newWordSeed: 20261117,
  showPronunciation: true,
  showPartOfSpeech: true,
  showExampleTranslations: true,
  showExerciseHints: true,
  autoplayAudio: false,
  ttsProvider: 'google',
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
  temperatureMode: 'auto',
  temperature: 0.7,
  aiFeedback: true,
  aiExercises: true,

  customWords: [],
  wordEdits: {},
  hiddenWords: [],
};

export function emptyProgress(): ProgressState {
  return {
    version: 1,
    cards: {},
    solutions: {},
    generatedExamples: {},
    generatedPractice: {},
    activity: {},
    reviewLog: [],
    reviewCount: 0,
    strongReviewCount: 0,
    levelPositions: {},
    seenWords: {},
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

/** Older sheets stored activity keys as Date strings. Normalize them to YYYY-MM-DD. */
function normalizeDayKey(key: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const parsed = new Date(key);
  if (Number.isNaN(parsed.getTime())) return key;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCustomTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;|]/)
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  raw.forEach((tag) => {
    if (typeof tag !== 'string') return;
    const cleaned = tag.replace(/\s+/g, ' ').trim().slice(0, 30);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key) || tags.length >= 8) return;
    seen.add(key);
    tags.push(cleaned);
  });
  return tags;
}

/**
 * Custom words are user data, so they are repaired rather than rejected:
 * a missing id is regenerated from the term, duplicate terms are dropped, and
 * oversized or malformed fields are trimmed. This keeps hand-edited storage
 * and older sheets usable.
 */
function normalizeCustomWords(raw: unknown): CustomWord[] {
  if (!Array.isArray(raw)) return [];
  const words: CustomWord[] = [];
  const ids = new Set<string>();
  const terms = new Set<string>();

  raw.slice(0, MAX_CUSTOM_WORDS).forEach((value) => {
    if (!isRecord(value)) return;
    const term = asString(value.term).replace(/\s+/g, ' ').trim().slice(0, 120);
    const definition = asString(value.definition)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    const level = value.level;
    if (!term || !definition || !(CEFR_LEVELS as string[]).includes(level as string)) return;

    const termKey = normalizeTermKey(term);
    if (terms.has(termKey)) return;
    terms.add(termKey);

    let id = asString(value.id).trim().slice(0, 140);
    if (!id.startsWith('custom-') || ids.has(id)) {
      id = createCustomWordId(term, ids);
    }
    ids.add(id);

    const importedAt = asNumber(value.importedAt, 0, 0, Number.MAX_SAFE_INTEGER);
    words.push({
      id,
      term,
      definition,
      level: level as CustomWord['level'],
      partOfSpeech: asString(value.partOfSpeech).trim().slice(0, 40) || undefined,
      pronunciation: asString(value.pronunciation).trim().slice(0, 80) || undefined,
      definitionTarget:
        asString(value.definitionTarget).trim().slice(0, 600) || undefined,
      tags: normalizeCustomTags(value.tags),
      ...(importedAt > 0 ? { importedAt } : {}),
      ...(asString(value.source).trim()
        ? { source: asString(value.source).trim().slice(0, 80) }
        : {}),
    });
  });

  return words;
}

/**
 * A built-in word edit only stores the fields the learner changed. Missing
 * optional strings are left untouched; explicitly empty strings clear a field.
 */
function normalizeWordEdit(raw: unknown): WordEdit | null {
  if (!isRecord(raw)) return null;
  const edit: WordEdit = {};

  const term = asString(raw.term).replace(/\s+/g, ' ').trim().slice(0, 120);
  if (term) edit.term = term;
  const definition = asString(raw.definition)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  if (definition) edit.definition = definition;

  const textField = (key: 'partOfSpeech' | 'pronunciation' | 'definitionTarget', max: number) => {
    if (!(key in raw)) return;
    const value = raw[key];
    if (typeof value !== 'string') return;
    edit[key] = value.replace(/\s+/g, ' ').trim().slice(0, max);
  };
  textField('partOfSpeech', 40);
  textField('pronunciation', 80);
  textField('definitionTarget', 600);

  if (Array.isArray(raw.tags) || typeof raw.tags === 'string') {
    edit.tags = normalizeCustomTags(raw.tags);
  }

  const level = raw.level;
  if (typeof level === 'string' && (CEFR_LEVELS as string[]).includes(level)) {
    edit.level = level as WordEdit['level'];
  }

  return Object.keys(edit).length > 0 ? edit : null;
}

function normalizeWordEdits(raw: unknown): Record<string, WordEdit> {
  if (!isRecord(raw)) return {};
  const edits: Record<string, WordEdit> = {};
  Object.entries(raw)
    .slice(0, MAX_CUSTOM_WORDS)
    .forEach(([wordId, value]) => {
      const id = wordId.trim().slice(0, 140);
      if (!id) return;
      const edit = normalizeWordEdit(value);
      if (edit) edits[id] = edit;
    });
  return edits;
}

function normalizeHiddenWords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const words: string[] = [];
  const seen = new Set<string>();
  raw.slice(0, MAX_CUSTOM_WORDS).forEach((value) => {
    if (typeof value !== 'string') return;
    const id = value.trim().slice(0, 140);
    if (!id || seen.has(id)) return;
    seen.add(id);
    words.push(id);
  });
  return words;
}

function normalizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {};
  const defaults = DEFAULT_SETTINGS;

  const theme = source.theme;
  const accent = source.accent;
  const provider = source.aiProvider;
  const thinking = source.geminiThinking;
  const storedTemperature = asNumber(source.temperature, defaults.temperature, 0, 2);
  // Older versions always sent a temperature. If it was changed from the old
  // 0.7 default, treat it as a deliberate override and keep it active.
  const temperatureMode: Settings['temperatureMode'] =
    source.temperatureMode === 'custom' || source.temperatureMode === 'auto'
      ? source.temperatureMode
      : source.temperature !== undefined && storedTemperature !== defaults.temperature
        ? 'custom'
        : defaults.temperatureMode;
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
    newWordOrder: source.newWordOrder === 'deck' ? 'deck' : defaults.newWordOrder,
    newWordSeed: Math.round(
      asNumber(source.newWordSeed, defaults.newWordSeed, 0, 2_147_483_647),
    ),
    showPronunciation: asBoolean(source.showPronunciation, defaults.showPronunciation),
    showPartOfSpeech: asBoolean(source.showPartOfSpeech, defaults.showPartOfSpeech),
    showExampleTranslations: asBoolean(
      source.showExampleTranslations,
      defaults.showExampleTranslations,
    ),
    showExerciseHints: asBoolean(source.showExerciseHints, defaults.showExerciseHints),
    autoplayAudio: asBoolean(source.autoplayAudio, defaults.autoplayAudio),
    ttsProvider: source.ttsProvider === 'browser' ? 'browser' : defaults.ttsProvider,
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
    openaiThinking: asString(source.openaiThinking, defaults.openaiThinking).slice(0, 40),
    temperatureMode,
    temperature: storedTemperature,
    aiFeedback: asBoolean(source.aiFeedback, defaults.aiFeedback),
    aiExercises: asBoolean(source.aiExercises, defaults.aiExercises),
    customWords: normalizeCustomWords(source.customWords),
    wordEdits: normalizeWordEdits(source.wordEdits),
    hiddenWords: normalizeHiddenWords(source.hiddenWords),
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

  const generatedExamples: Record<string, ExampleSentence[]> = {};
  if (isRecord(raw.generatedExamples)) {
    Object.entries(raw.generatedExamples).forEach(([wordId, examples]) => {
      if (!Array.isArray(examples)) return;
      const cleaned = examples
        .filter((example): example is Record<string, unknown> => isRecord(example))
        .map((example) => ({
          target: asString(example.target).trim(),
          native: asString(example.native).trim(),
        }))
        .filter((example) => example.target.length > 0);
      if (cleaned.length > 0) generatedExamples[wordId] = cleaned;
    });
  }

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
    Object.entries(raw.activity).forEach(([rawKey, value]) => {
      if (!isRecord(value)) return;
      const key = normalizeDayKey(rawKey);
      const studied = Math.round(asNumber(value.studied, 0, 0, 100_000));
      const reviews = Math.round(asNumber(value.reviews, 0, 0, 100_000));
      const existing = activity[key] ?? { studied: 0, reviews: 0 };
      activity[key] = {
        studied: Math.min(100_000, existing.studied + studied),
        reviews: Math.min(100_000, existing.reviews + reviews),
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

  const levelPositions: Record<string, number> = {};
  if (isRecord(raw.levelPositions)) {
    Object.entries(raw.levelPositions).forEach(([level, value]) => {
      if (!(CEFR_LEVELS as string[]).includes(level)) return;
      const index = Math.round(asNumber(value, -1, -1, 100_000));
      if (index >= 0) levelPositions[level] = index;
    });
  }

  const seenWords: Record<string, number> = {};
  if (isRecord(raw.seenWords)) {
    Object.entries(raw.seenWords).forEach(([wordId, value]) => {
      if (!wordId || wordId.length > 100 || Object.keys(seenWords).length >= 10_000) return;
      const at = asNumber(value, -1, -1, Number.MAX_SAFE_INTEGER);
      if (at >= 0) seenWords[wordId] = at;
    });
  }

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
    solutions: stringRecord(raw.solutions),
    generatedExamples,
    generatedPractice,
    activity,
    reviewLog: reviewLog.slice(0, 500),
    reviewCount,
    strongReviewCount,
    levelPositions,
    seenWords,
    lastStudied,
  };
}

export function parseStoredSettings(raw: string): Settings {
  return normalizeSettings(JSON.parse(raw));
}

export function parseStoredProgress(raw: string): ProgressState {
  return normalizeProgress(JSON.parse(raw));
}

/**
 * Remove every top-level `"responses"` subtree (a flat string map holding the
 * learner's typed translation attempts) from stored progress JSON.
 *
 * This works byte-wise so it can also repair values that no longer parse as
 * JSON. The needle `"responses"` with its quotes can only match a real object
 * key: quotes inside a JSON string value must be escaped. Returns the cleaned
 * text, or `null` when the subtree cannot be located and removed safely.
 */
function stripLegacyResponses(raw: string): string | null {
  let result = raw;
  for (let guard = 0; guard < 5; guard += 1) {
    const keyIndex = result.indexOf('"responses"');
    if (keyIndex === -1) return result;
    const valueStart = result.indexOf('{', keyIndex);
    // The key must be followed only by `:` and whitespace. This rejects a
    // `"responses"` that is not the object-valued key we know how to strip.
    if (valueStart === -1 || !/^\s*:\s*$/.test(result.slice(keyIndex + '"responses"'.length, valueStart))) {
      return null;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let valueEnd = -1;
    for (let i = valueStart; i < result.length; i += 1) {
      const ch = result.charAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          valueEnd = i + 1;
          break;
        }
      }
    }
    if (valueEnd === -1) return null;
    let start = keyIndex;
    let end = valueEnd;
    // Drop one adjacent comma too, whichever side has one.
    let probe = end;
    while (probe < result.length && /\s/.test(result.charAt(probe))) probe += 1;
    if (result.charAt(probe) === ',') {
      end = probe + 1;
    } else {
      let back = start;
      while (back > 0 && /\s/.test(result.charAt(back - 1))) back -= 1;
      if (result.charAt(back - 1) === ',') start = back - 1;
    }
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

function preserveCorruptValue(key: string, rawValue?: string): void {
  try {
    const raw = rawValue ?? window.localStorage.getItem(key);
    if (!raw) return;
    // A fixed suffix keeps at most one debug snapshot per key, so a value that
    // stays corrupt cannot grow storage on every load.
    const snapshotKey = `${key}.corrupt`;
    if (!raw.includes('"responses"')) {
      window.localStorage.setItem(snapshotKey, raw);
      return;
    }
    // Never carry typed translation answers into the debug snapshot.
    const cleaned = stripLegacyResponses(raw);
    if (cleaned) window.localStorage.setItem(snapshotKey, cleaned);
  } catch {
    // If storage itself is unavailable, there is nothing else to preserve.
  }
}

export function loadSettings(profile = ''): Settings {
  const key = storageKeyForProfile(SETTINGS_KEY, profile);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return parseStoredSettings(raw);
  } catch {
    preserveCorruptValue(key);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, profile = ''): boolean {
  try {
    window.localStorage.setItem(
      storageKeyForProfile(SETTINGS_KEY, profile),
      JSON.stringify(settings),
    );
    return true;
  } catch {
    // A full or unavailable storage quota should never break the app.
    return false;
  }
}

export function loadProgress(profile = ''): ProgressState {
  const key = storageKeyForProfile(PROGRESS_KEY, profile);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
    if (!raw) return emptyProgress();
    const parsed = parseStoredProgress(raw);
    // Older versions persisted the learner's typed translation attempts.
    // They are no longer kept anywhere, so scrub the stale copy on load.
    if (raw.includes('"responses"')) {
      try {
        window.localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        // The cleaned copy is best effort; parsing already dropped it in memory.
      }
    }
    return parsed;
  } catch {
    // The stored value cannot be parsed. Repair it without the legacy typed
    // answers when possible; whatever remains is as good as it gets.
    if (raw) {
      const cleaned = stripLegacyResponses(raw);
      if (cleaned) {
        try {
          const parsed = parseStoredProgress(cleaned);
          try {
            window.localStorage.setItem(key, cleaned);
          } catch {
            // Best effort; the parsed value is used either way.
          }
          return parsed;
        } catch {
          preserveCorruptValue(key, cleaned);
        }
      } else {
        // Typed answers cannot be ruled out, so the unusable key is removed
        // rather than left behind.
        try {
          window.localStorage.removeItem(key);
        } catch {
          // Storage unavailable; nothing more can be done.
        }
      }
    }
    return emptyProgress();
  }
}

export function saveProgress(progress: ProgressState, profile = ''): boolean {
  try {
    window.localStorage.setItem(
      storageKeyForProfile(PROGRESS_KEY, profile),
      JSON.stringify(progress),
    );
    return true;
  } catch {
    // The session still works in memory; the provider reports the failure.
    return false;
  }
}

/**
 * Remove the learner's previously typed translation attempts from every stored
 * copy on this browser — the local-only profile, per-email profiles, and any
 * legacy corrupt debug snapshots. Runs once at startup so stale answers never
 * survive an update, even in profiles that are not opened right now.
 */
export function scrubAllStoredProgress(): void {
  let keys: string[] = [];
  try {
    keys = Object.keys(window.localStorage);
  } catch {
    return;
  }
  keys.forEach((key) => {
    if (!key.startsWith(PROGRESS_KEY)) return;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw || !raw.includes('"responses"')) return;
      const cleaned = stripLegacyResponses(raw);
      if (cleaned === null) {
        // Cannot guarantee the typed answers are gone. The key is unusable
        // either way, so remove it rather than keep it around.
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, cleaned);
    } catch {
      // One unreadable key must not block the rest.
    }
  });
}

/** True when this browser already has an offline cache for the profile. */
export function hasStoredProfile(profile: string): boolean {
  const clean = profile.trim().toLowerCase();
  if (!clean) return false;
  try {
    return (
      window.localStorage.getItem(storageKeyForProfile(SETTINGS_KEY, clean)) !== null ||
      window.localStorage.getItem(storageKeyForProfile(PROGRESS_KEY, clean)) !== null
    );
  } catch {
    return false;
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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STORAGE_KEYS = { SETTINGS_KEY, PROGRESS_KEY };
