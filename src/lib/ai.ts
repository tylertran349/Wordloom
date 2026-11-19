import type {
  AiFeedback,
  ExampleSentence,
  Settings,
  ThinkingLevel,
  VocabWord,
} from '../types';
import { getLanguage } from '../data/languages';
import { temperatureForRequest } from './modelDefaults';

export interface ThinkingOption {
  value: ThinkingLevel;
  label: string;
  hint?: string;
}

export const GEMINI_THINKING_LEVELS: ThinkingOption[] = [
  { value: 'auto', label: 'Auto (default)', hint: 'Use whatever the model recommends' },
  { value: 'minimal', label: 'Minimal', hint: 'Fastest, lightest reasoning' },
  { value: 'low', label: 'Low', hint: 'Quick reasoning' },
  { value: 'medium', label: 'Medium', hint: 'Balanced reasoning' },
  { value: 'high', label: 'High', hint: 'Deepest reasoning' },
];

export const OPENAI_THINKING_LEVELS: ThinkingOption[] = [
  { value: 'auto', label: 'Auto (default)', hint: 'Leave the reasoning parameter out' },
  { value: 'none', label: 'None', hint: 'No extra reasoning' },
  { value: 'minimal', label: 'Minimal', hint: 'Fastest reasoning' },
  { value: 'low', label: 'Low', hint: 'Quick reasoning' },
  { value: 'medium', label: 'Medium', hint: 'Balanced reasoning' },
  { value: 'high', label: 'High', hint: 'Deepest reasoning' },
];

export const GEMINI_MODEL_SUGGESTIONS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
];

export const OPENAI_MODEL_SUGGESTIONS = [
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-5-mini',
  'gpt-5.1',
  'deepseek-chat',
  'qwen3-32b',
];

export function hasAiCredentials(settings: Settings): boolean {
  if (settings.aiProvider === 'gemini') {
    return Boolean(settings.geminiApiKey.trim() && settings.geminiModel.trim());
  }
  const baseUrl = settings.openaiBaseUrl.trim() || 'https://api.openai.com/v1';
  return Boolean(baseUrl && settings.openaiModel.trim());
}

export function activeProviderLabel(settings: Settings): string {
  return settings.aiProvider === 'gemini' ? 'Google Gemini' : 'Custom OpenAI-compatible';
}

function geminiThinkingConfig(
  level: ThinkingLevel,
  model: string,
  maxOutputTokens: number,
): Record<string, unknown> | undefined {
  if (level === 'auto') return undefined;
  if (/gemini-2\.5/i.test(model)) {
    const reserve = Math.min(400, Math.max(128, Math.floor(maxOutputTokens / 4)));
    const cap = Math.max(128, maxOutputTokens - reserve);
    const budgets: Record<ThinkingLevel, number> = {
      auto: 0,
      none: 0,
      minimal: /pro/i.test(model) ? Math.min(128, cap) : 0,
      low: Math.min(1024, cap),
      medium: Math.min(8192, cap),
      high: Math.min(24_576, cap),
    };
    return { thinkingBudget: budgets[level] };
  }
  if (level === 'none') return undefined;
  return { thinkingLevel: level };
}

function errorMessageFrom(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim();
    }
  }
  return fallback;
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 60_000,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw createCancelledError();
  const controller = new AbortController();
  // The caller's signal (component unmounted or exercise changed) and the
  // fixed timeout both cancel the same underlying fetch.
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let data: unknown = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }
    if (!response.ok) {
      const fallback =
        typeof data === 'string' && data.trim()
          ? data.trim().slice(0, 240)
          : `Request failed with HTTP ${response.status}.`;
      throw new Error(errorMessageFrom(data, fallback));
    }
    return data;
  } catch (error) {
    if (signal?.aborted) throw createCancelledError();
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The AI request timed out. Try a smaller/faster model or a higher thinking budget.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/** Marker error for requests the caller cancelled; hooks swallow these. */
function createCancelledError(): Error {
  const error = new Error('The AI request was cancelled.');
  error.name = 'CancelledError';
  return error;
}

export function isCancelledRequest(error: unknown): boolean {
  return error instanceof Error && error.name === 'CancelledError';
}

function extractGeminiText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const candidates = record.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const feedback = record.promptFeedback;
    if (feedback && typeof feedback === 'object') {
      const reason = (feedback as Record<string, unknown>).blockReason;
      if (typeof reason === 'string') {
        throw new Error(`Gemini blocked the request (${reason}). Try different content or settings.`);
      }
    }
    return '';
  }
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== 'object') return '';
  const content = (candidate as Record<string, unknown>).content;
  if (!content || typeof content !== 'object') return '';
  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(
      (part): part is Record<string, unknown> =>
        Boolean(part) && typeof part === 'object' && !(part as Record<string, unknown>).thought,
    )
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function callGemini(
  system: string,
  user: string,
  settings: Settings,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const key = settings.geminiApiKey.trim();
  const model = settings.geminiModel.trim();
  if (!key) throw new Error('Add a Google Gemini API key in Settings first.');
  if (!model) throw new Error('Add a Gemini model name in Settings first.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const buildBody = (includeThinking: boolean) => {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens,
    };
    if (temperature !== null) generationConfig.temperature = temperature;
    if (includeThinking) {
      const thinking = geminiThinkingConfig(settings.geminiThinking, model, maxOutputTokens);
      if (thinking) generationConfig.thinkingConfig = thinking;
    }
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig,
    };
  };

  const headers = { 'x-goog-api-key': key };
  let includeThinking = settings.geminiThinking !== 'auto';
  let temperature = temperatureForRequest(
    'gemini',
    model,
    settings.temperatureMode,
    settings.temperature,
  );
  let data: unknown;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      data = await postJson(url, headers, buildBody(includeThinking), 60_000, signal);
      lastError = undefined;
      break;
    } catch (error) {
      if (isCancelledRequest(error)) throw error;
      lastError =
        error instanceof Error ? error : new Error('The Gemini request failed.');
      const message = lastError.message;
      if (includeThinking && /thinking|thought|reasoning|budget/i.test(message)) {
        includeThinking = false;
        continue;
      }
      if (temperature !== null && /temperature/i.test(message)) {
        temperature = null;
        continue;
      }
      throw lastError;
    }
  }

  if (lastError) throw lastError;

  const text = extractGeminiText(data);
  if (!text) {
    throw new Error('Gemini returned an empty response. Check that the model name is valid.');
  }
  return text;
}

function extractOpenAiText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') return '';
  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
          ? ((part as Record<string, unknown>).text as string)
          : '',
      )
      .join('')
      .trim();
  }
  return '';
}

async function callOpenAiCompatible(
  system: string,
  user: string,
  settings: Settings,
  maxOutputTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const base = settings.openaiBaseUrl.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
  const model = settings.openaiModel.trim();
  if (!model) throw new Error('Enter a model name for your OpenAI-compatible API in Settings.');

  const url = /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`;
  const headers: Record<string, string> = {};
  if (settings.openaiApiKey.trim()) {
    headers.Authorization = `Bearer ${settings.openaiApiKey.trim()}`;
  }

  let body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxOutputTokens,
  };
  const temperature = temperatureForRequest(
    'openai',
    model,
    settings.temperatureMode,
    settings.temperature,
  );
  if (temperature !== null) body.temperature = temperature;
  const reasoningEffort = settings.openaiThinking.trim();
  if (reasoningEffort && reasoningEffort.toLowerCase() !== 'auto') {
    body.reasoning_effort = reasoningEffort;
  }

  let data: unknown;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      data = await postJson(url, headers, body, 60_000, signal);
      lastError = undefined;
      break;
    } catch (error) {
      if (isCancelledRequest(error)) throw error;
      lastError = error instanceof Error ? error : new Error('The API request failed.');
      const message = lastError.message;
      let adjusted = false;
      if (/temperature/i.test(message) && 'temperature' in body) {
        const { temperature: _temperature, ...rest } = body;
        body = rest;
        adjusted = true;
      }
      if (/reasoning_effort|reasoning effort|unsupported.*reasoning/i.test(message)) {
        if ('reasoning_effort' in body) {
          const { reasoning_effort: _reasoning, ...rest } = body;
          body = rest;
          adjusted = true;
        }
      }
      if (/max_tokens|max completion/i.test(message) && 'max_tokens' in body) {
        const { max_tokens: maxTokens, ...rest } = body;
        body = { ...rest, max_completion_tokens: maxTokens };
        adjusted = true;
      }
      if (!adjusted) throw lastError;
    }
  }

  if (lastError) throw lastError;

  const text = extractOpenAiText(data);
  if (!text) {
    throw new Error(
      'The API returned an empty response. Check the base URL, model name, and whether the model supports chat completions.',
    );
  }
  return text;
}

async function requestText(
  system: string,
  user: string,
  settings: Settings,
  maxOutputTokens = 1600,
  signal?: AbortSignal,
): Promise<string> {
  if (settings.aiProvider === 'gemini') {
    return callGemini(system, user, settings, maxOutputTokens, signal);
  }
  return callOpenAiCompatible(system, user, settings, maxOutputTokens, signal);
}

function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // Fall through.
      }
    }
    return null;
  }
}

/**
 * Recover complete example objects from a reply whose JSON was cut off or
 * wrapped in extra prose, so a long batch is not lost to one stray character.
 */
function salvageExamples(raw: string): ExampleSentence[] {
  const recovered: ExampleSentence[] = [];
  for (const chunk of raw.match(/\{[^{}]*\}/g) ?? []) {
    try {
      const item = JSON.parse(chunk) as Record<string, unknown>;
      const target = typeof item.target === 'string' ? item.target.trim() : '';
      if (!target) continue;
      const native = typeof item.native === 'string' ? item.native.trim() : '';
      recovered.push({ target, native });
    } catch {
      // Skip a partial or malformed object and keep the rest.
    }
  }
  return recovered;
}

/**
 * Safety net for pathological responses. Example generation is exhaustive, but
 * the prompt asks for every common use rather than a number, so only a runaway
 * reply is trimmed.
 */
const MAX_GENERATED_EXAMPLES = 40;

export interface ExerciseGenerationInput {
  word: VocabWord;
  count: number;
  /** Maximum examples. Omit to illustrate every common use of the word. */
  exampleCount?: number;
  settings: Settings;
  /** Restrict the request to a single content type. Defaults to both. */
  only?: 'examples' | 'sentences';
  /** Cancels the request when the caller goes away. */
  signal?: AbortSignal;
}

export interface GeneratedExercises {
  examples: ExampleSentence[];
  sentences: string[];
}

export interface ExampleGenerationInput {
  word: VocabWord;
  settings: Settings;
  /** Cancels the request when the caller goes away. */
  signal?: AbortSignal;
}

/**
 * Generate example sentences only — no practice exercises are requested. The
 * model is asked for as many sentences as it takes to illustrate every common
 * use of the word, not a fixed number.
 */
export async function generateExamples({
  word,
  settings,
  signal,
}: ExampleGenerationInput): Promise<ExampleSentence[]> {
  const result = await generateExercises({
    word,
    count: 0,
    settings,
    only: 'examples',
    signal,
  });
  return result.examples;
}

/** Generate translation practice sentences only — no examples are requested. */
export async function generatePracticeSentences({
  word,
  count,
  settings,
  signal,
}: {
  word: VocabWord;
  count: number;
  settings: Settings;
  signal?: AbortSignal;
}): Promise<string[]> {
  const result = await generateExercises({ word, count, settings, only: 'sentences', signal });
  return result.sentences;
}

/**
 * Ask the configured model for context sentences and/or translation prompts in
 * a single call. Solutions are deliberately left to Google Translate at reveal
 * time. Callers can limit the request to one content type with `only`.
 */
export async function generateExercises({
  word,
  count,
  exampleCount,
  settings,
  only,
  signal,
}: ExerciseGenerationInput): Promise<GeneratedExercises> {
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const wantExamples = only !== 'sentences';
  const wantSentences = only !== 'examples';

  const system = `You are an expert ${target.label} teacher and assessment writer. You create clear, level-appropriate example sentences and translation exercises and always respond with valid JSON only.`;
  const user = buildGenerationPrompt({
    word,
    count,
    exampleCount,
    targetLabel: target.label,
    nativeLabel: native.label,
    wantExamples,
    wantSentences,
  });

  // Exhaustive coverage produces a longer reply than a fixed two-sentence
  // batch, so example requests get more room before the response is cut off.
  const maxTokens = wantExamples ? 4096 : 3500;
  const raw = await requestText(system, user, settings, maxTokens, signal);
  const parsed = extractJson(raw);
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;

  const examples: ExampleSentence[] = [];
  if (record && Array.isArray(record.examples)) {
    record.examples.forEach((entry) => {
      if (typeof entry === 'string') {
        const targetSentence = entry.trim();
        if (targetSentence) examples.push({ target: targetSentence, native: '' });
        return;
      }
      if (!entry || typeof entry !== 'object') return;
      const item = entry as Record<string, unknown>;
      const targetSentence = typeof item.target === 'string' ? item.target.trim() : '';
      const nativeSentence = typeof item.native === 'string' ? item.native.trim() : '';
      if (!targetSentence) return;
      examples.push({ target: targetSentence, native: nativeSentence });
    });
  }
  // A long reply can be truncated mid-JSON or wrapped in prose. Keep every
  // complete example object instead of discarding the whole batch.
  if (wantExamples && examples.length === 0) examples.push(...salvageExamples(raw));

  const rawSentences = record && Array.isArray(record.sentences) ? record.sentences : [];
  const sentences = rawSentences
    .filter((sentence): sentence is string => typeof sentence === 'string')
    .map((sentence) => sentence.trim().replace(/^\d+[.)]\s*/, ''))
    .filter((sentence) => sentence.length > 0);

  const seenTargets = new Set<string>();
  const uniqueExamples = examples
    .filter((example) => {
      const key = example.target.trim().toLowerCase();
      if (seenTargets.has(key)) return false;
      seenTargets.add(key);
      return true;
    })
    .slice(0, exampleCount ?? MAX_GENERATED_EXAMPLES);

  const uniqueSentences = Array.from(new Set(sentences)).slice(0, count);

  if (wantExamples && !wantSentences && uniqueExamples.length === 0) {
    throw new Error('The model did not return usable example sentences. Try again or adjust the model settings.');
  }
  if (wantSentences && !wantExamples && uniqueSentences.length === 0) {
    throw new Error('The model did not return usable practice sentences. Try again or adjust the model settings.');
  }
  if (wantExamples && wantSentences && uniqueExamples.length === 0 && uniqueSentences.length === 0) {
    throw new Error('The model did not return usable exercises. Try again or adjust the model settings.');
  }
  return {
    examples: wantExamples ? uniqueExamples : [],
    sentences: wantSentences ? uniqueSentences : [],
  };
}

function buildGenerationPrompt({
  word,
  count,
  exampleCount,
  targetLabel,
  nativeLabel,
  wantExamples,
  wantSentences,
}: {
  word: VocabWord;
  count: number;
  exampleCount?: number;
  targetLabel: string;
  nativeLabel: string;
  wantExamples: boolean;
  wantSentences: boolean;
}): string {
  const shared = `Target vocabulary: "${word.term}" (${word.partOfSpeech ?? 'word'}) meaning "${word.definition}".
Match ${word.level} difficulty: vocabulary, grammar, and sentence length should fit that CEFR band.
Vary the grammar and context. Avoid repeating sentence openings.
Do not include notes, numbering, or anything besides the requested JSON.
Return strictly valid JSON with only the requested keys.`;

  // Without an explicit count the model decides how many sentences the word
  // needs: one per distinct use, so the learner sees every way to apply it.
  const exhaustive = exampleCount === undefined;
  const exampleClause = exhaustive
    ? `example sentences that illustrate every common use of "${word.term}"`
    : `${exampleCount} example sentences`;
  const exampleCoverage = exhaustive
    ? `Cover the full range of uses: every distinct meaning, part of speech, and typical collocation a ${word.level} learner is likely to meet.
Write one sentence per use and keep going until the uses are exhausted — do not stop at a round number, and do not pad with sentences that repeat the same pattern.
Most words need 4–8 sentences; a word with many senses needs more, and a word with one simple use needs fewer.`
    : '';

  const exampleRules = `- Examples: write the sentence in ${targetLabel} ("target") and its natural ${nativeLabel} translation ("native"). Examples must naturally use "${word.term}" in a common, natural way.${exampleCoverage ? `\n${exampleCoverage}` : ''}`;
  const practiceRules = `- Practice: write only the ${nativeLabel} sentences the learner should translate into ${targetLabel}. Each practice sentence must be unambiguous: the only natural ${targetLabel} rendering must use exactly "${word.term}", never a common synonym. Add the context, collocation, or detail that rules out synonyms, because a machine translator will otherwise pick whichever wording is most frequent.`;

  if (wantExamples && !wantSentences) {
    return `Create ${exampleClause} for a ${word.level} (CEFR) learner of ${targetLabel}.
${shared}
${exampleRules}
Strict JSON shape: {"examples":[{"target":"${targetLabel} sentence","native":"${nativeLabel} translation"}]}`;
  }
  if (wantSentences && !wantExamples) {
    return `Create ${count} ${nativeLabel} practice sentences for a ${word.level} (CEFR) learner of ${targetLabel}.
${shared}
${practiceRules}
Strict JSON shape: {"sentences":["${nativeLabel} sentence","..."]}`;
  }
  return `Create ${exampleClause} and ${count} ${nativeLabel} practice sentences for a ${word.level} (CEFR) learner of ${targetLabel}.
${shared}
${exampleRules}
${practiceRules}
Strict JSON shape: {"examples":[{"target":"${targetLabel} sentence","native":"${nativeLabel} translation"}],"sentences":["${nativeLabel} sentence","..."]}`;
}

export interface TranslationFeedbackInput {
  word: VocabWord;
  source: string;
  answer: string;
  settings: Settings;
  /** Cancels the request when the caller goes away. */
  signal?: AbortSignal;
}

export async function evaluateTranslation({
  word,
  source,
  answer,
  settings,
  signal,
}: TranslationFeedbackInput): Promise<AiFeedback> {
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);

  const system = `You are a supportive but precise ${target.label} tutor. Give brief, useful feedback on a learner's translation. Respond with valid JSON only.`;
  const user = `The learner is translating from ${native.label} into ${target.label} at CEFR level ${word.level}.
Target vocabulary: "${word.term}" meaning "${word.definition}".
Source sentence (${native.label}): ${JSON.stringify(source)}
Learner's translation (${target.label}): ${JSON.stringify(answer)}

Evaluate meaning, grammar, naturalness, and whether the target vocabulary is used correctly.
Respond in ${native.label} with this exact JSON shape:
{"verdict":"great"|"close"|"needs-work","feedback":"1–2 short sentences of specific feedback","suggestion":"a natural ${target.label} translation, or an empty string if the learner's version is already natural"}
Use "great" for accurate and natural, "close" for understandable with small errors, "needs-work" for meaning or major grammar problems.`;

  const raw = await requestText(system, user, settings, 1200, signal);
  const parsed = extractJson(raw);
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    const verdict =
      record.verdict === 'great' || record.verdict === 'close' || record.verdict === 'needs-work'
        ? record.verdict
        : 'close';
    const feedback = typeof record.feedback === 'string' ? record.feedback.trim() : '';
    if (feedback) {
      return {
        verdict,
        feedback,
        suggestion:
          typeof record.suggestion === 'string' && record.suggestion.trim()
            ? record.suggestion.trim()
            : undefined,
      };
    }
    throw new Error('The model returned an evaluation without feedback. Please try again.');
  }

  const fallback = raw.trim();
  if (!fallback) throw new Error('The model returned an empty evaluation.');
  return { verdict: 'close', feedback: fallback.slice(0, 800) };
}

export async function testAiConnection(settings: Settings): Promise<string> {
  const raw = await requestText(
    'You are a connectivity test. Follow the instruction exactly and do not add extra prose.',
    'Reply with exactly: OK',
    settings,
    1024,
  );
  const text = raw.trim();
  if (!text) throw new Error('The provider returned an empty response.');
  return text.slice(0, 120);
}
