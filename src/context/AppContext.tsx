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
  CustomWord,
  ExampleSentence,
  ProgressState,
  ReviewGrade,
  Settings,
  SRSCard,
  ToastMessage,
  VocabWord,
  WordEdit,
  WordInput,
} from '../types';
import { CEFR_LEVELS } from '../types';
import {
  ALL_WORDS as BUILTIN_WORDS,
  WORD_BY_ID as BUILTIN_WORD_BY_ID,
} from '../data/vocabulary';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  buildBackup,
  emptyProgress,
  hasStoredProfile,
  loadProgress,
  loadSettings,
  parseStoredProgress,
  parseStoredSettings,
  saveProgress,
  saveSettings,
  scrubAllStoredProgress,
  storageKeyForProfile,
} from '../lib/storage';
import { createCard, isDue, scheduleCard } from '../lib/srs';
import {
  dayKey,
  endOfDay,
  formatInterval,
  getPracticeSentences,
  hashString,
  seededShuffle,
} from '../lib/utils';
import {
  attachSheetUrl,
  beaconSheet,
  createLegacyConnection,
  createSheetConnection,
  hasProgressData,
  isValidEmail,
  loadSheetSync,
  normalizeEmail,
  readSheet,
  saveSheetSync,
  summarizeProgress,
  writeSheet,
  type SheetConnection,
  type SheetConnectionInput,
  type SheetReadResult,
  type SheetSnapshot,
  type SheetSyncState,
} from '../lib/sheets';
import {
  getReturningConnection,
  startSheetConnect,
} from '../lib/sheetConnect';
import { SHARED_SHEET_ENDPOINT } from '../lib/site';
import {
  createCustomWordId,
  MAX_CUSTOM_WORDS,
  normalizeTermKey,
  type ImportedWordEntry,
} from '../lib/wordImport';

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

export type SheetPhase = 'disconnected' | 'idle' | 'syncing' | 'unsaved' | 'error';

export interface SheetActionResult {
  ok: boolean;
  message: string;
  /** Optional visual tone for the settings alert. Defaults to ok ? success : error. */
  tone?: 'success' | 'error' | 'info';
}

export interface ImportWordsOptions {
  /** Extra tags applied to every word in the batch. */
  tags?: string[];
  /** Origin shown on the imported-word list. */
  source?: string;
}

export interface ImportWordsResult {
  added: number;
  skipped: number;
  duplicateTerms: string[];
}

export interface WordActionResult {
  ok: boolean;
  message: string;
  /** Set when a word was created or updated. */
  id?: string;
}

interface AppContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  progress: ProgressState;
  stats: AppStats;
  dueWords: VocabWord[];
  studiedWords: VocabWord[];
  /** Built-in plus custom words, in CEFR order. */
  allWords: VocabWord[];
  wordById: Record<string, VocabWord>;
  /** Built-in plus custom words, grouped by CEFR level. */
  levelWords: Record<CEFRLevel, VocabWord[]>;
  levelCounts: Record<CEFRLevel, number>;
  customWords: CustomWord[];
  wordEdits: Record<string, WordEdit>;
  hiddenWords: string[];
  hiddenWordsByLevel: Record<CEFRLevel, number>;
  /** Normalized terms that a new or imported word cannot reuse. */
  reservedTermKeys: Set<string>;
  /** Vocab words in the learner's chosen order, per CEFR level. */
  levelDecks: Record<CEFRLevel, VocabWord[]>;
  /** Every word in study order: CEFR levels, then the chosen order within each. */
  studyOrder: VocabWord[];
  /** Re-rolls the randomized new-word order. */
  shuffleWordOrder: () => void;
  /** Adds a hand-written word to a CEFR deck. */
  addWord: (input: WordInput) => WordActionResult;
  /** Edits an imported or built-in word while keeping its study progress. */
  updateWord: (wordId: string, input: WordInput) => WordActionResult;
  /** Deletes a custom word, or hides a built-in one. */
  deleteWord: (wordId: string) => WordActionResult;
  /** Removes changes to one built-in word and restores its original text. */
  resetWordEdit: (wordId: string) => void;
  /** Removes every built-in word edit. */
  resetWordEdits: () => void;
  /** Restores hidden built-in words, optionally only one CEFR level. */
  restoreHiddenWords: (level?: CEFRLevel) => void;
  /** Adds parsed words to a CEFR deck, skipping terms that already exist. */
  importWords: (
    entries: ImportedWordEntry[],
    level: CEFRLevel,
    options?: ImportWordsOptions,
  ) => ImportWordsResult;
  removeCustomWord: (id: string) => void;
  clearCustomWords: () => void;
  markStudied: (wordId: string) => boolean;
  removeStudied: (wordId: string) => boolean;
  gradeCard: (wordId: string, grade: ReviewGrade) => void;
  /**
   * Mark a word as seen. Words that were seen but never added to the review
   * queue are skipped when the app picks new words to study.
   */
  markSeen: (wordId: string) => void;
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
  /** Word pages opened this session, oldest first, without duplicates. */
  wordHistory: string[];
  /** Record that the learner opened a word page. */
  recordWordVisit: (wordId: string) => void;
  notify: (message: string, tone?: ToastMessage['tone']) => void;
  toast: ToastMessage | null;
  dismissToast: () => void;
  getCard: (wordId: string) => SRSCard | undefined;
  getPractice: (wordId: string) => string[];

  // Google Sheets
  sheetSync: SheetSyncState;
  sheetPhase: SheetPhase;
  sheetBusy: boolean;
  /** Redirects to Google to pick or create the spreadsheet. */
  connectSheet: () => SheetActionResult;
  /** Replaces this browser's data with the old shared-sheet rows for an email. */
  importLegacySheet: (legacyEmail?: string) => Promise<SheetActionResult>;
  signInSheet: (email: string) => Promise<SheetActionResult>;
  signOutSheet: () => void;
  syncSheet: () => Promise<SheetActionResult>;
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

function computeStats(
  progress: ProgressState,
  wordById: Record<string, VocabWord>,
  levelWords: Record<CEFRLevel, VocabWord[]>,
  now = Date.now(),
): AppStats {
  const today = dayKey(now);
  const dayEnd = endOfDay(now).getTime();
  const cards = Object.values(progress.cards).filter((card) => Boolean(wordById[card.wordId]));
  const todayActivity = progress.activity[today] ?? { studied: 0, reviews: 0 };

  const levelStats = CEFR_LEVELS.map((level) => {
    const words = levelWords[level];
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

function normalizeWordTags(tags: string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  (tags ?? []).forEach((tag) => {
    const cleaned = tag.replace(/\s+/g, ' ').trim().slice(0, 30);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key) || result.length >= 8) return;
    seen.add(key);
    result.push(cleaned);
  });
  return result;
}

function cleanText(value: string | undefined, max: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Merge a learner's edit into a built-in word. Empty optional values clear the
 * field, while a missing value leaves the original in place.
 */
function applyWordEdit(word: VocabWord, edit: WordEdit | undefined): VocabWord {
  if (!edit) return word;
  const optional = (
    value: string | undefined,
    fallback: string | undefined,
  ): string | undefined => {
    if (value === undefined) return fallback;
    return value.trim() || undefined;
  };
  return {
    ...word,
    term: edit.term?.trim() || word.term,
    definition: edit.definition?.trim() || word.definition,
    partOfSpeech: optional(edit.partOfSpeech, word.partOfSpeech),
    pronunciation: optional(edit.pronunciation, word.pronunciation),
    definitionTarget: optional(edit.definitionTarget, word.definitionTarget),
    tags: edit.tags ?? word.tags,
    level: edit.level ?? word.level,
  };
}

type TermClash = {
  word: VocabWord;
  reason: 'visible' | 'hidden' | 'reserved';
};

function clashMessage(clash: TermClash): string {
  if (clash.reason === 'hidden') {
    return `“${clash.word.term}” is hidden from your decks. Restore it in Settings → Data instead.`;
  }
  if (clash.reason === 'reserved') {
    return `“${clash.word.term}” is reserved by the built-in deck. Use a different term or reset that word's edit.`;
  }
  return `“${clash.word.term}” already exists in ${clash.word.level}.`;
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong while syncing with Google Sheets. Your data is safe in this browser.';
}

/** True when the learner has entered at least one AI API key. */
function hasApiKeys(settings: Settings): boolean {
  return Boolean(settings.geminiApiKey.trim() || settings.openaiApiKey.trim());
}

/** True when this browser has custom words or built-in edits worth uploading. */
function hasVocabularyChanges(settings: Settings): boolean {
  return (
    settings.customWords.length > 0 ||
    Object.keys(settings.wordEdits).length > 0 ||
    settings.hiddenWords.length > 0
  );
}

/** True when two states point at the same spreadsheet and account. */
function sameConnection(
  current: SheetConnection | null,
  expected: SheetConnection,
): boolean {
  return Boolean(
    current &&
      current.endpoint === expected.endpoint &&
      current.email === expected.email &&
      current.sheetId === expected.sheetId,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * The sheet share is created seconds before the first read. Retry a few times
 * so a brand-new connection does not fail while Google catches up.
 */
async function readSheetWithRetry(
  connection: SheetConnection,
  attempts = 3,
): Promise<SheetReadResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await readSheet(connection);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await delay(1200 * (attempt + 1));
    }
  }
  throw lastError;
}

export function AppProvider({ children }: { children: ReactNode }) {
  // Read the sync config first: it tells us which local profile to open.
  // Any stored traces of previously typed translation attempts are removed
  // before the active profile is read.
  const [initial] = useState(() => {
    scrubAllStoredProgress();
    const sync = loadSheetSync();
    return { sync, email: sync.email };
  });
  const [settings, setSettings] = useState<Settings>(() => loadSettings(initial.email));
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress(initial.email));
  // Session-only trail of opened word pages. It powers the "previous" links
  // so they follow what the learner actually looked at, not the deck order.
  const [wordHistory, setWordHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [clock, setClock] = useState(() => Date.now());
  const remoteSettings = useRef(false);
  const remoteProgress = useRef(false);
  const storageWarned = useRef(false);
  const markLocalChangeRef = useRef<() => void>(() => {});
  // The active local cache: blank for local-only, otherwise the learner email.
  const profileRef = useRef(initial.email);

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
    // Vocabulary changes are user content, not preferences, so restoring
    // defaults must not delete custom words, edits, or hidden-word choices.
    setSettings((current) => ({
      ...DEFAULT_SETTINGS,
      customWords: current.customWords,
      wordEdits: current.wordEdits,
      hiddenWords: current.hiddenWords,
    }));
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
  // Google Sheets sync. Once a sheet is linked it is the source of truth, so
  // conflicts always resolve to the sheet's copy. localStorage remains the
  // offline cache and the fallback when no sheet is linked. One deployment
  // serves every learner, and the email they enter is the only account
  // identifier. Every write carries the remote revision it was based on so
  // two devices cannot silently overwrite each other.
  // ---------------------------------------------------------------------------
  const [sheetSync, setSheetSync] = useState<SheetSyncState>(initial.sync);
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
      // API keys sync with the sheet. If an older sheet has no key yet, keep
      // this device's key instead of clearing it during the first pull.
      const localGeminiKey = settingsRef.current.geminiApiKey;
      const localOpenAiKey = settingsRef.current.openaiApiKey;
      // The legacy shared sheet is readable by email, so it never carries keys.
      const sharesCredentials = connection?.kind !== 'legacy';
      const remoteKnowsGeminiKey =
        sharesCredentials &&
        (snapshot.credentialRows?.geminiApiKey ??
          Boolean(snapshot.settings.geminiApiKey.trim()));
      const remoteKnowsOpenAiKey =
        sharesCredentials &&
        (snapshot.credentialRows?.openaiApiKey ??
          Boolean(snapshot.settings.openaiApiKey.trim()));
      const inheritedKey =
        sharesCredentials &&
        ((!remoteKnowsGeminiKey && Boolean(localGeminiKey.trim())) ||
          (!remoteKnowsOpenAiKey && Boolean(localOpenAiKey.trim())));
      const nextSettings = {
        ...snapshot.settings,
        geminiApiKey: remoteKnowsGeminiKey ? snapshot.settings.geminiApiKey : localGeminiKey,
        openaiApiKey: remoteKnowsOpenAiKey ? snapshot.settings.openaiApiKey : localOpenAiKey,
      };
      // Update the refs now so an immediate push sends the snapshot, not the
      // pre-import state.
      settingsRef.current = nextSettings;
      progressRef.current = snapshot.progress;
      setSettings(nextSettings);
      setProgress(snapshot.progress);
      const base = connection ?? sheetRef.current.connection;
      patchSheet({
        connection: base ? attachSheetUrl(base, snapshot.sheetUrl) : null,
        lastRemoteUpdatedAt: snapshot.updatedAt,
        lastSyncedAt: Date.now(),
        localChangedAt: snapshot.updatedAt,
        dirty: false,
        lastError: null,
      });
      // A key that exists only on this device has just been merged into the
      // settings; upload it so the sheet gains the credential too.
      if (inheritedKey) markLocalChangeRef.current();
    },
    [patchSheet],
  );

  const performPush = useCallback(
    async (force: boolean): Promise<SheetActionResult> => {
      const current = sheetRef.current;
      if (!current.email) {
        return { ok: false, message: 'Sign in with Google in Settings → Google Sheets first to turn on sync.' };
      }
      if (!current.connection) {
        return {
          ok: false,
          message: 'Google Sheets sync is not set up for this site yet. Ask the site owner to finish the setup.',
        };
      }
      if (!force && !current.dirty) {
        return { ok: true, message: 'Up to date.' };
      }
      const connection = current.connection;
      const email = current.email;
      const changedAt = current.localChangedAt;
      const isLive = () =>
        sheetRef.current.email === email && sameConnection(sheetRef.current.connection, connection);
      try {
        let result = await writeSheet(connection, {
          email,
          settings: settingsRef.current,
          progress: progressRef.current,
          deviceId: current.deviceId,
          baseUpdatedAt: force ? 0 : current.lastRemoteUpdatedAt,
        });

        if (!isLive()) {
          return { ok: false, message: 'Sync was interrupted because the account changed. Try again.' };
        }

        if (result.conflict) {
          // The linked sheet wins. Discard this browser's unsaved edits and
          // show the copy that another device saved to the sheet.
          applySheetSnapshot(result.conflict.snapshot, connection);
          const message =
            'Google Sheets changed on another device, so Wordloom loaded the sheet version. Local changes made since the last sync were replaced.';
          notify(message, 'info');
          return { ok: true, tone: 'info', message };
        }

        const stillDirty = sheetRef.current.localChangedAt !== changedAt;
        const summary = summarizeProgress(progressRef.current);
        patchSheet({
          connection: attachSheetUrl(connection, result.sheetUrl),
          email,
          lastRemoteUpdatedAt: result.updatedAt,
          lastSyncedAt: Date.now(),
          localChangedAt: stillDirty ? sheetRef.current.localChangedAt : result.updatedAt,
          dirty: stillDirty,
          lastError: null,
        });
        // Edits made while the upload was in flight need another pass.
        if (stillDirty) markLocalChangeRef.current();
        return {
          ok: true,
          message:
            summary.cards > 0
              ? `Saved ${summary.cards} ${summary.cards === 1 ? 'card' : 'cards'} to Google Sheets.`
              : 'Saved your settings to Google Sheets.',
        };
      } catch (error) {
        const message = messageFromError(error);
        patchSheet({ lastError: message });
        return { ok: false, message };
      }
    },
    [applySheetSnapshot, notify, patchSheet],
  );

  const pushSheet = useCallback(
    async (force = true): Promise<SheetActionResult> => {
      if (busyRef.current) return { ok: false, message: 'A sync check is already running. Try again in a moment.' };
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

  const syncSheet = useCallback(async (): Promise<SheetActionResult> => {
    const current = sheetRef.current;
    if (!current.email) {
      return { ok: false, message: 'Sign in with Google in Settings → Google Sheets first to turn on sync.' };
    }
    if (!current.connection) {
      return {
        ok: false,
        message: 'Google Sheets sync is not set up for this site yet. Ask the site owner to finish the setup.',
      };
    }
    if (busyRef.current) return { ok: false, message: 'A sync check is already running. Try again in a moment.' };
    busyRef.current = true;
    setSheetBusy(true);
    const email = current.email;
    try {
      const remote = await readSheet(current.connection, email);
      if (!sameConnection(sheetRef.current.connection, current.connection)) {
        return { ok: false, message: 'Sync was interrupted because the spreadsheet changed. Try again.' };
      }
      const connection = attachSheetUrl(current.connection, remote.sheetUrl);
      const dirty = sheetRef.current.dirty;
      const remoteChanged =
        remote.hasData && remote.updatedAt > sheetRef.current.lastRemoteUpdatedAt;

      if (!remote.hasData) {
        patchSheet({ connection, lastError: null });
        if (
          hasProgressData(progressRef.current) ||
          hasVocabularyChanges(settingsRef.current) ||
          dirty ||
          (connection.kind === 'sheet' && hasApiKeys(settingsRef.current))
        ) {
          return await performPush(true);
        }
        return { ok: true, message: `You’re syncing as ${email}. Changes will be backed up automatically.` };
      }

      // The linked sheet is the source of truth. When it has a newer copy —
      // or this browser has no data — load it and drop local unsaved edits.
      if (remoteChanged || !hasProgressData(progressRef.current)) {
        const replacedLocalEdits = dirty;
        applySheetSnapshot(remote.snapshot, connection);
        if (replacedLocalEdits) {
          notify(
            'Google Sheets had a newer copy, so Wordloom loaded the sheet version and replaced unsaved local changes.',
            'info',
          );
        }
        return {
          ok: true,
          message: `Loaded ${remote.summary.cards} ${remote.summary.cards === 1 ? 'card' : 'cards'} for ${email} from Google Sheets.`,
        };
      }

      // The sheet has not changed, so local edits can be uploaded to it.
      if (dirty) return await performPush(false);

      const localSettings = settingsRef.current;
      const remoteSettings = remote.snapshot.settings;
      const remoteKnowsGeminiKey =
        remote.snapshot.credentialRows?.geminiApiKey ??
        Boolean(remoteSettings.geminiApiKey.trim());
      const remoteKnowsOpenAiKey =
        remote.snapshot.credentialRows?.openaiApiKey ??
        Boolean(remoteSettings.openaiApiKey.trim());
      const needsSecretUpload =
        connection.kind === 'sheet' &&
        ((Boolean(localSettings.geminiApiKey.trim()) && !remoteKnowsGeminiKey) ||
          (Boolean(localSettings.openaiApiKey.trim()) && !remoteKnowsOpenAiKey));
      // Existing keys entered before this sheet was connected still need to
      // reach the sheet once. Remote has not changed, so this push is safe.
      if (needsSecretUpload) {
        patchSheet({ dirty: true, localChangedAt: Date.now() });
        return await performPush(false);
      }
      patchSheet({ connection, lastSyncedAt: Date.now(), lastError: null });
      return { ok: true, message: 'You’re all caught up.' };
    } catch (error) {
      const message = messageFromError(error);
      patchSheet({ lastError: message });
      return { ok: false, message };
    } finally {
      busyRef.current = false;
      setSheetBusy(false);
    }
  }, [applySheetSnapshot, notify, patchSheet, performPush]);

  const signInSheet = useCallback(
    async (emailInput: string): Promise<SheetActionResult> => {
      const email = normalizeEmail(emailInput);
      if (!isValidEmail(email)) {
        return { ok: false, message: 'Enter a valid email address, for example you@example.com.' };
      }
      const connection = createLegacyConnection(email);
      if (!SHARED_SHEET_ENDPOINT || !connection) {
        return {
          ok: false,
          message: 'Google Sheets sync is not set up for this site yet. Ask the site owner to finish the setup.',
        };
      }
      if (busyRef.current) return { ok: false, message: 'A sync check is already running. Try again in a moment.' };
      busyRef.current = true;
      setSheetBusy(true);
      // Cancel any queued autosave from the previous account or sheet.
      if (pushTimer.current) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = undefined;
      }

      const previousEmail = sheetRef.current.email;
      const switching = previousEmail !== email;
      let nextSettings = settingsRef.current;
      let nextProgress = progressRef.current;

      if (switching) {
        if (previousEmail) {
          // Same browser, different account: never carry one learner's
          // progress or settings into another learner's profile.
          if (hasStoredProfile(email)) {
            nextSettings = loadSettings(email);
            nextProgress = loadProgress(email);
          } else {
            nextSettings = { ...DEFAULT_SETTINGS };
            nextProgress = emptyProgress();
          }
        } else if (hasStoredProfile(email)) {
          nextSettings = loadSettings(email);
          nextProgress = loadProgress(email);
        }
        // Coming from local-only use with no cache for this email keeps the
        // local progress and settings as the candidate to upload.
      }

      try {
        const epoch = disconnectEpoch.current;
        // Read before switching profiles, so a failed read leaves the current
        // account (and its offline cache) exactly as it was.
        const remote = await readSheet(connection, email);
        if (disconnectEpoch.current !== epoch) {
          return { ok: false, message: 'The sign-in was cancelled. Try again.' };
        }

        // Local-only edits made while the read was in flight are the candidate
        // to upload for a brand-new account.
        if (switching && !previousEmail && !hasStoredProfile(email)) {
          nextSettings = settingsRef.current;
          nextProgress = progressRef.current;
        }

        if (switching) {
          saveSettings(settingsRef.current, previousEmail);
          saveProgress(progressRef.current, previousEmail);
          profileRef.current = email;
          settingsRef.current = nextSettings;
          progressRef.current = nextProgress;
          setSettings(nextSettings);
          setProgress(nextProgress);
          saveSettings(nextSettings, email);
          saveProgress(nextProgress, email);
        }

        const attached = attachSheetUrl(connection, remote.sheetUrl);
        patchSheet({
          email,
          connection: attached,
          lastRemoteUpdatedAt: remote.updatedAt,
          lastSyncedAt: null,
          lastError: null,
          dirty: false,
          localChangedAt: 0,
        });

        if (!remote.hasData) {
          const hadProgress =
            hasProgressData(progressRef.current) || hasVocabularyChanges(settingsRef.current);
          patchSheet({
            dirty: true,
            localChangedAt: Date.now(),
          });
          const result = await performPush(true);
          return {
            ok: result.ok,
            message: result.ok
              ? hadProgress
                ? `Backed up this browser’s data to ${email}.`
                : `You’re syncing as ${email}. Changes will be backed up automatically.`
              : result.message,
          };
        }

        // A linked sheet is the source of truth, so load its copy even when
        // this browser already has its own progress.
        applySheetSnapshot(remote.snapshot, attached);
        return {
          ok: true,
          message: `You’re syncing as ${email}. Loaded ${remote.summary.cards} ${remote.summary.cards === 1 ? 'card' : 'cards'} from the sheet.`,
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

  const signOutSheet = useCallback(() => {
    disconnectEpoch.current += 1;
    if (pushTimer.current) {
      window.clearTimeout(pushTimer.current);
      pushTimer.current = undefined;
    }
    const currentEmail = sheetRef.current.email;
    if (currentEmail) {
      // Keep this email's offline cache. Logging out only removes the
      // email/connection association from this browser.
      saveSettings(settingsRef.current, currentEmail);
      saveProgress(progressRef.current, currentEmail);
    }
    // Mirror the current data to the signed-out cache so reloading shows the
    // same progress. Nothing is deleted.
    saveSettings(settingsRef.current, '');
    saveProgress(progressRef.current, '');
    profileRef.current = '';
    patchSheet({
      email: '',
      connection: null,
      lastRemoteUpdatedAt: 0,
      lastSyncedAt: null,
      lastError: null,
      dirty: false,
      localChangedAt: 0,
    });
  }, [patchSheet]);

  const connectSheet = useCallback((): SheetActionResult => {
    const url = startSheetConnect();
    if (!url) {
      return {
        ok: false,
        message:
          'Google sign-in is not configured for this build. Ask the site owner to finish the Google Sheets setup.',
      };
    }
    // The return trip reloads the app, so persist everything first.
    saveSettings(settingsRef.current, profileRef.current);
    saveProgress(progressRef.current, profileRef.current);
    window.location.assign(url);
    return { ok: true, message: 'Opening Google...' };
  }, []);

  /**
   * Finish a Google sign-in. The connect page hands back the verified email,
   * spreadsheet id, secret, and URL, so this runs after the app reloads.
   */
  const completeSheetConnection = useCallback(
    async (input: SheetConnectionInput): Promise<SheetActionResult> => {
      const connection = createSheetConnection(input);
      if (!connection) {
        return {
          ok: false,
          message:
            'Google Sheets sync is not set up for this site yet. Ask the site owner to finish the setup.',
        };
      }
      const email = connection.email;
      if (busyRef.current) {
        return { ok: false, message: 'A sync check is already running. Try again in a moment.' };
      }

      busyRef.current = true;
      setSheetBusy(true);
      // Cancel any queued autosave from the previous account or sheet.
      if (pushTimer.current) {
        window.clearTimeout(pushTimer.current);
        pushTimer.current = undefined;
      }

      const previousEmail = sheetRef.current.email;
      const previousConnection = sheetRef.current.connection;
      const switching = previousEmail !== email;
      const hasNewProfile = switching && hasStoredProfile(email);
      // Local-only use and the old email-based sheet both keep this browser's
      // progress as the candidate for the new Google account. A stored profile
      // for the Google account still wins when it exists.
      const carryLocal =
        switching && !hasNewProfile && (!previousEmail || previousConnection?.kind === 'legacy');
      let nextSettings = settingsRef.current;
      let nextProgress = progressRef.current;

      if (switching) {
        if (previousEmail) {
          // Keep the old profile on disk either way.
          saveSettings(settingsRef.current, previousEmail);
          saveProgress(progressRef.current, previousEmail);
        }
        if (carryLocal) {
          nextSettings = settingsRef.current;
          nextProgress = progressRef.current;
        } else if (hasNewProfile) {
          nextSettings = loadSettings(email);
          nextProgress = loadProgress(email);
        } else {
          nextSettings = { ...DEFAULT_SETTINGS };
          nextProgress = emptyProgress();
        }
      }

      try {
        const epoch = disconnectEpoch.current;
        if (switching) {
          profileRef.current = email;
          settingsRef.current = nextSettings;
          progressRef.current = nextProgress;
          setSettings(nextSettings);
          setProgress(nextProgress);
          saveSettings(nextSettings, email);
          saveProgress(nextProgress, email);
        }

        patchSheet({
          email,
          connection,
          lastRemoteUpdatedAt: 0,
          lastSyncedAt: null,
          lastError: null,
          dirty: false,
          localChangedAt: 0,
        });

        let remote: SheetReadResult;
        try {
          remote = await readSheetWithRetry(connection);
        } catch (error) {
          const message = messageFromError(error);
          patchSheet({ lastError: message });
          return {
            ok: false,
            message: `${message} Press Sync now in a moment to retry.`,
          };
        }
        if (disconnectEpoch.current !== epoch) {
          return { ok: false, message: 'The sign-in was cancelled. Try again.' };
        }

        const label = connection.name || 'your spreadsheet';

        if (!remote.hasData) {
          const hadProgress =
            hasProgressData(progressRef.current) || hasVocabularyChanges(settingsRef.current);
          const hadApiKey = hasApiKeys(settingsRef.current);
          patchSheet({ lastRemoteUpdatedAt: remote.updatedAt });
          if (!hadProgress && !hadApiKey) {
            return {
              ok: true,
              message: `Connected to ${email}. Changes save to ${label} automatically.`,
            };
          }
          patchSheet({ dirty: true, localChangedAt: Date.now() });
          const result = await performPush(true);
          return {
            ok: result.ok,
            message: result.ok
              ? hadProgress
                ? `Connected. Backed up this browser's data to ${label}.`
                : `Connected. Saved this browser's AI key to ${label}.`
              : result.message,
          };
        }

        // The sheet wins whenever it has data, including when this browser
        // already has its own progress.
        applySheetSnapshot(remote.snapshot, connection);
        return {
          ok: true,
          message: `Connected to ${email}. Loaded ${remote.summary.cards} ${
            remote.summary.cards === 1 ? 'card' : 'cards'
          } from ${label}.`,
        };
      } finally {
        busyRef.current = false;
        setSheetBusy(false);
      }
    },
    [applySheetSnapshot, patchSheet, performPush],
  );

  // The connect page sends the app back with a fragment; apply it once.
  const returningConnection = useRef<SheetConnectionInput | null>(getReturningConnection());
  const completeConnectionRef = useRef(completeSheetConnection);
  completeConnectionRef.current = completeSheetConnection;

  useEffect(() => {
    const pending = returningConnection.current;
    if (!pending) return;
    returningConnection.current = null;
    void completeConnectionRef.current(pending).then((result) => {
      notify(result.message, result.ok ? 'success' : result.tone === 'info' ? 'info' : 'error');
    });
  }, [notify]);

  /**
   * Copy progress from the legacy shared sheet into the learner's own sheet.
   * Reuses the normal read + push path, so conflicts resolve to the sheet.
   */
  const importLegacySheet = useCallback(
    async (legacyEmail?: string): Promise<SheetActionResult> => {
      const current = sheetRef.current;
      if (!current.connection || current.connection.kind !== 'sheet') {
        return { ok: false, message: 'Connect your own Google Sheet first.' };
      }
      const legacy = createLegacyConnection();
      if (!legacy) {
        return { ok: false, message: 'The old shared sheet is not configured for this build.' };
      }
      const email = normalizeEmail(legacyEmail || current.email);
      if (!isValidEmail(email)) {
        return { ok: false, message: 'Enter the email you used with the old shared sheet.' };
      }
      if (busyRef.current) {
        return { ok: false, message: 'A sync check is already running. Try again in a moment.' };
      }

      const connection = current.connection;
      busyRef.current = true;
      setSheetBusy(true);
      try {
        const target = await readSheet(connection);
        if (!sameConnection(sheetRef.current.connection, connection)) {
          return {
            ok: false,
            message: 'Sync was interrupted because the spreadsheet changed. Try again.',
          };
        }
        if (target.hasData) {
          return {
            ok: false,
            message:
              'Your Google Sheet already has progress. Import works on an empty sheet; use Sync now to load the sheet.',
          };
        }

        const remote = await readSheet(legacy, email);
        if (!sameConnection(sheetRef.current.connection, connection)) {
          return {
            ok: false,
            message: 'Sync was interrupted because the spreadsheet changed. Try again.',
          };
        }
        if (!remote.hasData) {
          return {
            ok: false,
            message: `The old shared sheet has no saved progress for ${email}.`,
          };
        }
        applySheetSnapshot(remote.snapshot, connection);
        patchSheet({ dirty: true, localChangedAt: Date.now() });
        const result = await performPush(true);
        return result.ok
          ? {
              ok: true,
              message: `Imported ${remote.summary.cards} ${
                remote.summary.cards === 1 ? 'card' : 'cards'
              } from ${email} into ${connection.name || 'your sheet'}.`,
            }
          : result;
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

  /** Mark a local edit and upload once the learner pauses for a moment. */
  const markLocalChange = useCallback(() => {
    if (!sheetRef.current.connection || !sheetRef.current.email) return;
    patchSheet({ dirty: true, localChangedAt: Date.now() });
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    // Debounced so a burst of edits produces one upload. Each upload rewrites
    // the sheet tabs, so keep this well under Google's per-minute write quota.
    pushTimer.current = window.setTimeout(() => {
      pushTimer.current = undefined;
      void pushSheet(false);
    }, 5000);
  }, [patchSheet, pushSheet]);

  markLocalChangeRef.current = markLocalChange;

  const flushSheet = useCallback(() => {
    const current = sheetRef.current;
    if (!current.connection || !current.email || !current.dirty) return;
    beaconSheet(current.connection, {
      email: current.email,
      settings: settingsRef.current,
      progress: progressRef.current,
      deviceId: current.deviceId,
      baseUpdatedAt: current.lastRemoteUpdatedAt,
    });
  }, []);

  // Sync once when an email appears, and check again when the tab returns.
  const autoSyncRef = useRef(syncSheet);
  autoSyncRef.current = syncSheet;
  useEffect(() => {
    if (!sheetSync.connection || !sheetSync.email) return;
    const timer = window.setTimeout(() => {
      lastSheetCheck.current = Date.now();
      void autoSyncRef.current();
    }, 600);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSheetCheck.current < 60_000) return;
      lastSheetCheck.current = Date.now();
      void autoSyncRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sheetSync.email]);

  useEffect(
    () => () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (remoteSettings.current) {
      remoteSettings.current = false;
      return;
    }
    if (!saveSettings(settings, profileRef.current)) reportStorageFailure();
  }, [settings, reportStorageFailure]);

  useEffect(() => {
    if (remoteProgress.current) {
      remoteProgress.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (!saveProgress(progress, profileRef.current)) reportStorageFailure();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [progress, reportStorageFailure]);

  // Keep tabs in sync. The remote flags prevent a write-back loop: applying a
  // value from another tab must not trigger another save here.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      const profile = profileRef.current;
      if (event.key === storageKeyForProfile(STORAGE_KEYS.SETTINGS_KEY, profile) && event.newValue) {
        try {
          const incoming = parseStoredSettings(event.newValue);
          remoteSettings.current = true;
          setSettings(incoming);
        } catch {
          // Ignore malformed writes from another tab.
        }
      } else if (
        event.key === storageKeyForProfile(STORAGE_KEYS.PROGRESS_KEY, profile) &&
        event.newValue
      ) {
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
      saveProgress(progress, profileRef.current);
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

  const customWords = settings.customWords;

  // Imported and hand-written words join the generated deck; built-in words
  // can carry learner edits or be hidden. Built-in vocabulary always wins a
  // term collision, so hand-edited storage cannot shadow an existing word.
  const allWords = useMemo<VocabWord[]>(() => {
    const hidden = new Set(settings.hiddenWords);
    const takenIds = new Set(BUILTIN_WORDS.map((word) => word.id));
    const takenTerms = new Set(BUILTIN_WORDS.map((word) => normalizeTermKey(word.term)));
    const builtIn = BUILTIN_WORDS.filter((word) => !hidden.has(word.id)).map((word) =>
      applyWordEdit(word, settings.wordEdits[word.id]),
    );
    const imported: VocabWord[] = [];
    customWords.forEach((word) => {
      const termKey = normalizeTermKey(word.term);
      if (takenIds.has(word.id) || takenTerms.has(termKey)) return;
      takenIds.add(word.id);
      takenTerms.add(termKey);
      imported.push({
        id: word.id,
        term: word.term,
        definition: word.definition,
        partOfSpeech: word.partOfSpeech,
        pronunciation: word.pronunciation,
        definitionTarget: word.definitionTarget,
        tags: word.tags,
        level: word.level,
      });
    });
    return [...builtIn, ...imported];
  }, [customWords, settings.wordEdits, settings.hiddenWords]);

  const wordById = useMemo<Record<string, VocabWord>>(
    () => Object.fromEntries(allWords.map((word) => [word.id, word])),
    [allWords],
  );

  const levelWords = useMemo<Record<CEFRLevel, VocabWord[]>>(
    () =>
      Object.fromEntries(
        CEFR_LEVELS.map((level) => [
          level,
          allWords.filter((word) => word.level === level),
        ]),
      ) as Record<CEFRLevel, VocabWord[]>,
    [allWords],
  );

  const levelCounts = useMemo<Record<CEFRLevel, number>>(
    () =>
      Object.fromEntries(
        CEFR_LEVELS.map((level) => [level, levelWords[level].length]),
      ) as Record<CEFRLevel, number>,
    [levelWords],
  );

  const hiddenWordsByLevel = useMemo<Record<CEFRLevel, number>>(() => {
    const counts = Object.fromEntries(
      CEFR_LEVELS.map((level) => [level, 0]),
    ) as Record<CEFRLevel, number>;
    settings.hiddenWords.forEach((id) => {
      const word = BUILTIN_WORD_BY_ID[id];
      if (!word) return;
      const level = settings.wordEdits[id]?.level ?? word.level;
      counts[level] += 1;
    });
    return counts;
  }, [settings.hiddenWords, settings.wordEdits]);

  const reservedTermKeys = useMemo(() => {
    const keys = new Set(BUILTIN_WORDS.map((word) => normalizeTermKey(word.term)));
    allWords.forEach((word) => keys.add(normalizeTermKey(word.term)));
    settings.hiddenWords.forEach((id) => {
      const word = BUILTIN_WORD_BY_ID[id];
      if (!word) return;
      keys.add(normalizeTermKey(applyWordEdit(word, settings.wordEdits[id]).term));
    });
    return keys;
  }, [allWords, settings.hiddenWords, settings.wordEdits]);

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

  const levelDecks = useMemo(() => {
    const decks = {} as Record<CEFRLevel, VocabWord[]>;
    CEFR_LEVELS.forEach((level) => {
      const words = levelWords[level] ?? [];
      decks[level] =
        settings.newWordOrder === 'random'
          ? seededShuffle(words, hashString(level) ^ settings.newWordSeed)
          : words;
    });
    return decks;
  }, [levelWords, settings.newWordOrder, settings.newWordSeed]);

  const studyOrder = useMemo(
    () => CEFR_LEVELS.flatMap((level) => levelDecks[level]),
    [levelDecks],
  );

  const shuffleWordOrder = useCallback(() => {
    updateSettings({ newWordSeed: Math.floor(Math.random() * 2_147_483_647) });
    notify('New word order shuffled.', 'info');
  }, [notify, updateSettings]);

  // Resume positions are stored as deck indexes. Adding words at the end is
  // safe, but hiding, deleting, moving, or restoring a word can shift every
  // later index. Clear the affected level so "Resume" never lands on the
  // wrong word.
  const clearLevelResume = useCallback((levels: CEFRLevel[]) => {
    if (levels.length === 0) return;
    setProgress((current) => {
      let changed = false;
      const levelPositions = { ...current.levelPositions };
      levels.forEach((level) => {
        if (levelPositions[level] !== undefined) {
          delete levelPositions[level];
          changed = true;
        }
      });
      return changed ? { ...current, levelPositions } : current;
    });
  }, []);

  const importWords = useCallback(
    (
      entries: ImportedWordEntry[],
      level: CEFRLevel,
      options: ImportWordsOptions = {},
    ): ImportWordsResult => {
      const takenIds = new Set(allWords.map((word) => word.id));
      const takenTerms = new Set(reservedTermKeys);
      const fresh: CustomWord[] = [];
      const duplicateTerms: string[] = [];
      const existingCount = settings.customWords.length;
      let skipped = 0;
      const now = Date.now();

      entries.forEach((entry) => {
        if (existingCount + fresh.length >= MAX_CUSTOM_WORDS) {
          skipped += 1;
          return;
        }
        const term = entry.term.replace(/\s+/g, ' ').trim().slice(0, 120);
        const definition = entry.definition
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 600);
        if (!term || !definition) {
          skipped += 1;
          return;
        }
        const termKey = normalizeTermKey(term);
        if (takenTerms.has(termKey)) {
          duplicateTerms.push(term);
          skipped += 1;
          return;
        }
        takenTerms.add(termKey);

        const id = createCustomWordId(term, takenIds);
        takenIds.add(id);

        const tags: string[] = [];
        const seenTags = new Set<string>();
        [...['imported'], ...(options.tags ?? []), ...entry.tags].forEach((tag) => {
          const cleaned = tag.replace(/\s+/g, ' ').trim().slice(0, 30);
          const key = cleaned.toLowerCase();
          if (!cleaned || seenTags.has(key) || tags.length >= 8) return;
          seenTags.add(key);
          tags.push(cleaned);
        });

        fresh.push({
          id,
          term,
          definition,
          level,
          partOfSpeech: entry.partOfSpeech?.trim().slice(0, 40) || undefined,
          pronunciation: entry.pronunciation?.trim().slice(0, 80) || undefined,
          definitionTarget:
            entry.definitionTarget?.trim().slice(0, 600) || undefined,
          tags,
          importedAt: now,
          ...(options.source ? { source: options.source.slice(0, 80) } : {}),
        });
      });

      if (fresh.length > 0) {
        setSettings((current) => ({
          ...current,
          customWords: [...current.customWords, ...fresh],
        }));
        markLocalChangeRef.current();
      }

      return { added: fresh.length, skipped, duplicateTerms };
    },
    [allWords, reservedTermKeys, settings.customWords],
  );

  const removeCustomWord = useCallback((id: string) => {
    const removed = settings.customWords.find((word) => word.id === id);
    setSettings((current) => {
      if (!current.customWords.some((word) => word.id === id)) return current;
      return {
        ...current,
        customWords: current.customWords.filter((word) => word.id !== id),
      };
    });
    if (removed) clearLevelResume([removed.level]);
    markLocalChangeRef.current();
  }, [clearLevelResume, settings.customWords]);

  // Look across visible words (including edits), hidden built-ins, and the
  // built-in deck's original terms, so two words can never share a term and a
  // reset edit cannot resurrect a duplicate.
  const findTermClash = useCallback(
    (termKey: string, excludeId?: string): TermClash | undefined => {
      const visible = allWords.find(
        (word) => word.id !== excludeId && normalizeTermKey(word.term) === termKey,
      );
      if (visible) return { word: visible, reason: 'visible' };

      for (const id of settings.hiddenWords) {
        if (id === excludeId) continue;
        const base = BUILTIN_WORD_BY_ID[id];
        if (!base) continue;
        const word = applyWordEdit(base, settings.wordEdits[id]);
        if (normalizeTermKey(word.term) === termKey) {
          return { word, reason: 'hidden' };
        }
      }

      const reserved = BUILTIN_WORDS.find(
        (word) => word.id !== excludeId && normalizeTermKey(word.term) === termKey,
      );
      if (reserved) {
        return {
          word: reserved,
          reason: settings.hiddenWords.includes(reserved.id) ? 'hidden' : 'reserved',
        };
      }
      return undefined;
    },
    [allWords, settings.hiddenWords, settings.wordEdits],
  );

  const addWord = useCallback(
    (input: WordInput): WordActionResult => {
      const term = cleanText(input.term, 120);
      const definition = cleanText(input.definition, 600);
      if (!term || !definition) {
        return { ok: false, message: 'A word needs both a term and a meaning.' };
      }

      const clash = findTermClash(normalizeTermKey(term));
      if (clash) {
        return { ok: false, message: clashMessage(clash) };
      }
      if (settings.customWords.length >= MAX_CUSTOM_WORDS) {
        return {
          ok: false,
          message: `Your custom word collection is full (${MAX_CUSTOM_WORDS.toLocaleString()} words). Remove a word before adding another.`,
        };
      }

      const id = createCustomWordId(term, new Set(allWords.map((word) => word.id)));
      const word: CustomWord = {
        id,
        term,
        definition,
        level: input.level,
        partOfSpeech: cleanText(input.partOfSpeech, 40) || undefined,
        pronunciation: cleanText(input.pronunciation, 80) || undefined,
        definitionTarget: cleanText(input.definitionTarget, 600) || undefined,
        tags: normalizeWordTags(input.tags),
        importedAt: Date.now(),
        source: 'Added by hand',
      };
      setSettings((current) => ({
        ...current,
        customWords: [...current.customWords, word],
      }));
      markLocalChangeRef.current();
      return { ok: true, message: `Added “${term}” to ${input.level}.`, id };
    },
    [allWords, findTermClash, settings.customWords],
  );

  const updateWord = useCallback(
    (wordId: string, input: WordInput): WordActionResult => {
      const currentWord = wordById[wordId] ?? BUILTIN_WORD_BY_ID[wordId];
      if (!currentWord) {
        return { ok: false, message: 'That word is no longer in the deck.' };
      }

      const term = cleanText(input.term, 120);
      const definition = cleanText(input.definition, 600);
      if (!term || !definition) {
        return { ok: false, message: 'A word needs both a term and a meaning.' };
      }

      const clash = findTermClash(normalizeTermKey(term), wordId);
      if (clash) {
        return { ok: false, message: clashMessage(clash) };
      }

      const partOfSpeech = cleanText(input.partOfSpeech, 40);
      const pronunciation = cleanText(input.pronunciation, 80);
      const definitionTarget = cleanText(input.definitionTarget, 600);
      const tags = normalizeWordTags(input.tags);

      if (settings.customWords.some((word) => word.id === wordId)) {
        setSettings((current) => ({
          ...current,
          customWords: current.customWords.map((word) =>
            word.id === wordId
              ? {
                  ...word,
                  term,
                  definition,
                  level: input.level,
                  partOfSpeech: partOfSpeech || undefined,
                  pronunciation: pronunciation || undefined,
                  definitionTarget: definitionTarget || undefined,
                  tags,
                }
              : word,
          ),
        }));
      } else {
        const base = BUILTIN_WORD_BY_ID[wordId];
        const baseTags = base?.tags ?? [];
        const matchesOriginal =
          Boolean(base) &&
          term === base.term &&
          definition === base.definition &&
          (partOfSpeech || undefined) === base.partOfSpeech &&
          (pronunciation || undefined) === base.pronunciation &&
          (definitionTarget || undefined) === base.definitionTarget &&
          input.level === base.level &&
          tags.length === baseTags.length &&
          tags.every((tag, index) => tag === baseTags[index]);

        if (matchesOriginal) {
          // Saving a built-in word unchanged should not leave a spurious
          // "Edited" badge behind. If an older edit exists, drop it.
          if (settings.wordEdits[wordId]) {
            const previousLevel = settings.wordEdits[wordId]?.level;
            setSettings((current) => {
              if (current.wordEdits[wordId] === undefined) return current;
              const wordEdits = { ...current.wordEdits };
              delete wordEdits[wordId];
              return { ...current, wordEdits };
            });
            if (previousLevel && previousLevel !== base.level) {
              clearLevelResume([base.level, previousLevel]);
            }
            markLocalChangeRef.current();
          }
          return { ok: true, message: `Saved “${term}”.`, id: wordId };
        }

        const edit: WordEdit = {
          term,
          definition,
          level: input.level,
          partOfSpeech,
          pronunciation,
          definitionTarget,
          tags,
        };
        setSettings((current) => ({
          ...current,
          wordEdits: { ...current.wordEdits, [wordId]: edit },
        }));
      }
      markLocalChangeRef.current();
      const moved = currentWord.level !== input.level;
      if (moved) clearLevelResume([currentWord.level, input.level]);
      return {
        ok: true,
        message: moved
          ? `Saved “${term}” and moved it to ${input.level}.`
          : `Saved “${term}”.`,
        id: wordId,
      };
    },
    [
      wordById,
      findTermClash,
      settings.customWords,
      settings.wordEdits,
      clearLevelResume,
    ],
  );

  const deleteWord = useCallback(
    (wordId: string): WordActionResult => {
      const word = wordById[wordId] ?? BUILTIN_WORD_BY_ID[wordId];
      if (!word) {
        return { ok: false, message: 'That word is no longer in the deck.' };
      }

      if (settings.customWords.some((entry) => entry.id === wordId)) {
        setSettings((current) => ({
          ...current,
          customWords: current.customWords.filter((entry) => entry.id !== wordId),
        }));
        clearLevelResume([word.level]);
        markLocalChangeRef.current();
        return { ok: true, message: `Deleted “${word.term}”.` };
      }

      if (!BUILTIN_WORD_BY_ID[wordId] || settings.hiddenWords.includes(wordId)) {
        return { ok: false, message: 'That word is no longer in the deck.' };
      }
      setSettings((current) => ({
        ...current,
        hiddenWords: current.hiddenWords.includes(wordId)
          ? current.hiddenWords
          : [...current.hiddenWords, wordId],
      }));
      clearLevelResume([word.level]);
      markLocalChangeRef.current();
      return {
        ok: true,
        message: `Removed “${word.term}” from the ${word.level} deck. You can restore it in Settings → Data.`,
      };
    },
    [wordById, settings.customWords, settings.hiddenWords, clearLevelResume],
  );

  const resetWordEdit = useCallback(
    (wordId: string) => {
      const edit = settings.wordEdits[wordId];
      const base = BUILTIN_WORD_BY_ID[wordId];
      if (edit?.level && base && edit.level !== base.level) {
        clearLevelResume([base.level, edit.level]);
      }
      setSettings((current) => {
        if (current.wordEdits[wordId] === undefined) return current;
        const wordEdits = { ...current.wordEdits };
        delete wordEdits[wordId];
        return { ...current, wordEdits };
      });
      markLocalChangeRef.current();
    },
    [settings.wordEdits, clearLevelResume],
  );

  const resetWordEdits = useCallback(() => {
    const levels = new Set<CEFRLevel>();
    Object.entries(settings.wordEdits).forEach(([id, edit]) => {
      if (!edit.level) return;
      const base = BUILTIN_WORD_BY_ID[id];
      if (base && edit.level === base.level) return;
      levels.add(edit.level);
      if (base) levels.add(base.level);
    });
    if (levels.size > 0) clearLevelResume([...levels]);
    setSettings((current) => {
      if (Object.keys(current.wordEdits).length === 0) return current;
      return { ...current, wordEdits: {} };
    });
    markLocalChangeRef.current();
  }, [settings.wordEdits, clearLevelResume]);

  const restoreHiddenWords = useCallback(
    (level?: CEFRLevel) => {
      const affected = new Set<CEFRLevel>();
      settings.hiddenWords.forEach((id) => {
        const base = BUILTIN_WORD_BY_ID[id];
        if (!base) return;
        const hiddenLevel = settings.wordEdits[id]?.level ?? base.level;
        if (!level || hiddenLevel === level) affected.add(hiddenLevel);
      });
      if (affected.size > 0) clearLevelResume([...affected]);
      setSettings((current) => ({
        ...current,
        hiddenWords: level
          ? current.hiddenWords.filter((id) => {
              const word = BUILTIN_WORD_BY_ID[id];
              if (!word) return false;
              return (current.wordEdits[id]?.level ?? word.level) !== level;
            })
          : [],
      }));
      markLocalChangeRef.current();
    },
    [settings.hiddenWords, settings.wordEdits, clearLevelResume],
  );

  const clearCustomWords = useCallback(() => {
    const levels = new Set<CEFRLevel>(
      settings.customWords.map((word) => word.level),
    );
    if (levels.size > 0) clearLevelResume([...levels]);
    setSettings((current) => {
      if (current.customWords.length === 0) return current;
      return { ...current, customWords: [] };
    });
    markLocalChangeRef.current();
  }, [settings.customWords, clearLevelResume]);

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

  const removeStudied = useCallback(
    (wordId: string): boolean => {
      if (!progress.cards[wordId]) {
        notify('This word is not in your review queue.', 'info');
        return false;
      }
      markLocalChange();
      setProgress((current) => {
        if (!current.cards[wordId]) return current;
        const cards = { ...current.cards };
        delete cards[wordId];
        return {
          ...current,
          cards,
          lastStudied:
            current.lastStudied?.wordId === wordId ? undefined : current.lastStudied,
        };
      });
      notify('Removed from your review queue.');
      return true;
    },
    [markLocalChange, notify, progress.cards],
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

  const markSeen = useCallback(
    (wordId: string) => {
      // No-op when the word is already known, so revisiting a page does not
      // schedule a sync for nothing.
      if (progressRef.current.seenWords[wordId]) return;
      markLocalChange();
      setProgress((current) => {
        if (current.seenWords[wordId]) return current;
        return {
          ...current,
          seenWords: { ...current.seenWords, [wordId]: Date.now() },
        };
      });
    },
    [markLocalChange],
  );

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
          // Only touch the content type that was generated. Writing an empty
          // array for the other type makes generated-content syncs fire for
          // words that never had that kind of content.
          generatedExamples:
            examples.length > 0 || existingExamples.length > 0
              ? { ...current.generatedExamples, [wordId]: mergedExamples }
              : current.generatedExamples,
          generatedPractice:
            sentences.length > 0 || existingSentences.length > 0
              ? { ...current.generatedPractice, [wordId]: mergedSentences }
              : current.generatedPractice,
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

  const recordWordVisit = useCallback((wordId: string) => {
    setWordHistory((current) => {
      const last = current[current.length - 1];
      if (last === wordId) return current;
      // Returning to the page we just came from drops that page from the
      // trail, so repeated "previous" presses keep walking backwards.
      if (current[current.length - 2] === wordId) return current.slice(0, -1);
      // Any other visit moves the word to the end of the trail.
      return [...current.filter((id) => id !== wordId), wordId].slice(-50);
    });
  }, []);

  const stats = useMemo(
    () => computeStats(progress, wordById, levelWords, clock),
    [progress, wordById, levelWords, clock],
  );

  const dueWords = useMemo(
    () =>
      allWords.filter((word) => isDue(progress.cards[word.id], clock)).sort(
        (a, b) => (progress.cards[a.id]?.due ?? 0) - (progress.cards[b.id]?.due ?? 0),
      ),
    [allWords, progress.cards, clock],
  );

  const studiedWords = useMemo(
    () =>
      allWords.filter((word) => Boolean(progress.cards[word.id])).sort(
        (a, b) => (progress.cards[a.id]?.due ?? 0) - (progress.cards[b.id]?.due ?? 0),
      ),
    [allWords, progress.cards],
  );

  const getPractice = useCallback(
    (wordId: string) => {
      const word = wordById[wordId];
      if (!word) return [];
      return getPracticeSentences(
        Math.max(20, settings.exercisesPerWord),
        progress.generatedPractice[wordId] ?? [],
      );
    },
    [wordById, progress.generatedPractice, settings.exercisesPerWord],
  );

  const getCard = useCallback(
    (wordId: string) => progress.cards[wordId],
    [progress.cards],
  );

  const sheetPhase: SheetPhase = !sheetSync.connection
    ? 'disconnected'
    : sheetBusy
      ? 'syncing'
      : sheetSync.lastError
        ? 'error'
        : sheetSync.dirty
          ? 'unsaved'
          : 'idle';

  const value: AppContextValue = {
    settings,
    updateSettings,
    resetSettings,
    progress,
    stats,
    dueWords,
    studiedWords,
    allWords,
    wordById,
    levelWords,
    levelCounts,
    customWords,
    wordEdits: settings.wordEdits,
    hiddenWords: settings.hiddenWords,
    hiddenWordsByLevel,
    reservedTermKeys,
    levelDecks,
    studyOrder,
    shuffleWordOrder,
    addWord,
    updateWord,
    deleteWord,
    resetWordEdit,
    resetWordEdits,
    restoreHiddenWords,
    importWords,
    removeCustomWord,
    clearCustomWords,
    markStudied,
    removeStudied,
    gradeCard,
    markSeen,
    setSolution,
    addGeneratedExercises,
    importBackup,
    exportBackup,
    resetProgress,
    recordLevelPosition,
    wordHistory,
    recordWordVisit,
    notify,
    toast,
    dismissToast,
    getCard,
    getPractice,
    sheetSync,
    sheetPhase,
    sheetBusy,
    connectSheet,
    importLegacySheet,
    signInSheet,
    signOutSheet,
    syncSheet,
    flushSheet,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside an AppProvider.');
  return context;
}
