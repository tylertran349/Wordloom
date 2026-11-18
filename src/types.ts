export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface ExampleSentence {
  /** Sentence in the language being learned. */
  target: string;
  /** Translation in the learner's native language. */
  native: string;
}

/** A vocabulary entry as authored in src/data/vocabulary.ts. */
export interface VocabEntry {
  id: string;
  term: string;
  pronunciation?: string;
  partOfSpeech?: string;
  /** Definition in the learner's native language. */
  definition: string;
  /** Optional definition in the target language. */
  definitionTarget?: string;
  tags?: string[];
}

/** A vocabulary entry enriched with the CEFR level it belongs to. */
export interface VocabWord extends VocabEntry {
  level: CEFRLevel;
}

/**
 * A word the learner imported from a list (Quizlet export, CSV, JSON, or
 * plain text) or added by hand. Custom words live beside the built-in deck:
 * they are stored with settings, sync with Google Sheets, and take part in
 * study and review exactly like built-in words.
 */
export interface CustomWord extends VocabEntry {
  level: CEFRLevel;
  /** Unix timestamp in milliseconds; omitted for words restored from older data. */
  importedAt?: number;
  /** Human-readable origin, for example a file name or “Quizlet / TSV”. */
  source?: string;
}

/**
 * A change made to a built-in word. The id stays the same, so study progress
 * remains attached. Empty optional strings deliberately clear a field.
 */
export interface WordEdit {
  term?: string;
  definition?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definitionTarget?: string;
  tags?: string[];
  level?: CEFRLevel;
}

/** Values submitted by the add/edit word form. */
export interface WordInput {
  term: string;
  definition: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definitionTarget?: string;
  tags?: string[];
  level: CEFRLevel;
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export type CardStatus = 'learning' | 'review' | 'mastered';

export interface SRSCard {
  wordId: string;
  /** Ease factor, usually 1.3–3.5. */
  ease: number;
  /** Current interval in days. Fractional values are used for learning steps. */
  interval: number;
  repetitions: number;
  lapses: number;
  /** Unix timestamp in milliseconds. */
  due: number;
  createdAt: number;
  lastReviewed?: number;
  totalReviews: number;
  status: CardStatus;
}

export interface ReviewLogEntry {
  wordId: string;
  grade: ReviewGrade;
  at: number;
  /** Interval scheduled after this review, in days. */
  interval: number;
}

export interface DayActivity {
  studied: number;
  reviews: number;
}

export interface ProgressState {
  version: 1;
  cards: Record<string, SRSCard>;
  /** Cached translation solutions keyed by `${wordId}::${exerciseKey}`. */
  solutions: Record<string, string>;
  /** AI-generated example sentences, keyed by word id. */
  generatedExamples: Record<string, ExampleSentence[]>;
  /** AI-generated native-language practice sentences, keyed by word id. */
  generatedPractice: Record<string, string[]>;
  activity: Record<string, DayActivity>;
  reviewLog: ReviewLogEntry[];
  /** Lifetime review totals. `reviewLog` is capped as recent display history. */
  reviewCount: number;
  strongReviewCount: number;
  /** Last deck index the learner opened, per CEFR level. */
  levelPositions: Record<string, number>;
  /**
   * Words the learner has opened, keyed by word id with the last-opened
   * timestamp. Words that were seen but never added to the review queue are
   * not "new" anymore and are skipped when the app picks new words to study.
   */
  seenWords: Record<string, number>;
  lastStudied?: { wordId: string; at: number };
}

export type ThemeMode = 'light' | 'dark' | 'system';
/** 'random' mixes words across topics; 'deck' follows the vocabulary file. */
export type NewWordOrder = 'random' | 'deck';
export type AccentColor = 'jade' | 'indigo' | 'coral' | 'amber' | 'violet';
export type AIProvider = 'gemini' | 'openai';
/** 'google' uses Google Translate's free web TTS; 'browser' uses speechSynthesis. */
export type TtsProvider = 'google' | 'browser';
export type ThinkingLevel = 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high';
/** 'auto' follows the model/provider default; 'custom' sends the user's value. */
export type TemperatureMode = 'auto' | 'custom';

export interface Settings {
  // General
  displayName: string;
  targetLanguage: string;
  nativeLanguage: string;
  dailyGoal: number;
  newWordsPerDay: number;
  maxReviewsPerDay: number;

  // Appearance
  theme: ThemeMode;
  accent: AccentColor;
  fontScale: number;
  reduceMotion: boolean;

  // Study
  exercisesPerWord: number;
  /** How new words are ordered inside a CEFR deck. */
  newWordOrder: NewWordOrder;
  /** Stable seed for the randomized order; reshuffling picks a new one. */
  newWordSeed: number;
  showPronunciation: boolean;
  showPartOfSpeech: boolean;
  showExampleTranslations: boolean;
  showExerciseHints: boolean;
  autoplayAudio: boolean;
  ttsProvider: TtsProvider;
  ttsRate: number;

  // Spaced repetition
  startingEase: number;
  easyBonus: number;
  hardMultiplier: number;
  maxIntervalDays: number;
  learningStepMinutes: number;
  reviewShowExample: boolean;
  reviewExercise: boolean;

  // Google Translate (free web endpoint)
  googleTranslateEnabled: boolean;
  autoRevealSolutions: boolean;
  showTranslateLink: boolean;

  // AI provider
  aiProvider: AIProvider;
  geminiApiKey: string;
  geminiModel: string;
  geminiThinking: ThinkingLevel;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  /** Free-text level, sent as `reasoning_effort`; blank or "auto" omits it. */
  openaiThinking: string;
  /** Whether to send `temperature` or leave it to the provider (default). */
  temperatureMode: TemperatureMode;
  /** Value used only when `temperatureMode` is 'custom'. */
  temperature: number;
  aiFeedback: boolean;
  aiExercises: boolean;

  /** Words imported from lists or added by hand. */
  customWords: CustomWord[];
  /** Changes to built-in words, keyed by their stable word id. */
  wordEdits: Record<string, WordEdit>;
  /** Built-in word ids the learner removed from their decks. */
  hiddenWords: string[];
}

export interface SRSConfig {
  startingEase: number;
  easyBonus: number;
  hardMultiplier: number;
  maxIntervalDays: number;
  learningStepMinutes: number;
}

export interface AiFeedback {
  verdict: 'great' | 'close' | 'needs-work';
  feedback: string;
  suggestion?: string;
}

export interface ToastMessage {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

export interface BackupFile {
  app: 'wordloom';
  version: 1;
  exportedAt: string;
  settings: Settings;
  progress: ProgressState;
}

export type Route =
  | { name: 'dashboard' }
  | { name: 'level'; level: CEFRLevel }
  | { name: 'word'; level: CEFRLevel; wordId: string }
  | { name: 'review'; practice?: boolean }
  | { name: 'progress' }
  | { name: 'import'; level?: CEFRLevel }
  | { name: 'settings' };
