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
  examples: ExampleSentence[];
  /** Native-language sentences for the learner to translate into the target language. */
  practice: string[];
  tags?: string[];
}

/** A vocabulary entry enriched with the CEFR level it belongs to. */
export interface VocabWord extends VocabEntry {
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
  /** Draft answers keyed by `${wordId}::${exerciseKey}`. */
  responses: Record<string, string>;
  /** Cached translation solutions keyed by `${wordId}::${exerciseKey}`. */
  solutions: Record<string, string>;
  /** AI-generated native-language practice sentences, keyed by word id. */
  generatedPractice: Record<string, string[]>;
  activity: Record<string, DayActivity>;
  reviewLog: ReviewLogEntry[];
  /** Lifetime review totals. `reviewLog` is capped as recent display history. */
  reviewCount: number;
  strongReviewCount: number;
  lastStudied?: { wordId: string; at: number };
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'jade' | 'indigo' | 'coral' | 'amber' | 'violet';
export type AIProvider = 'gemini' | 'openai';
export type ThinkingLevel = 'auto' | 'none' | 'minimal' | 'low' | 'medium' | 'high';

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
  showPronunciation: boolean;
  showPartOfSpeech: boolean;
  showExampleTranslations: boolean;
  showExerciseHints: boolean;
  autoplayAudio: boolean;
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
  openaiThinking: ThinkingLevel;
  temperature: number;
  aiFeedback: boolean;
  aiExercises: boolean;
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
  | { name: 'settings' };
