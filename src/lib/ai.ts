import type {
  AiFeedback,
  Settings,
  ThinkingLevel,
  VocabWord,
} from '../types';
import { getLanguage } from '../data/languages';

export interface ThinkingOption {
  value: ThinkingLevel;
  label: string;
  hint?: string;
}

export const GEMINI_THINKING_LEVELS: ThinkingOption[] = [
  { value: 'auto', label: 'Auto', hint: 'Let the model decide' },
  { value: 'minimal', label: 'Minimal', hint: 'Fastest, lightest reasoning' },
  { value: 'low', label: 'Low', hint: 'Quick reasoning' },
  { value: 'medium', label: 'Medium', hint: 'Balanced reasoning' },
  { value: 'high', label: 'High', hint: 'Deepest reasoning' },
];

export const OPENAI_THINKING_LEVELS: ThinkingOption[] = [
  { value: 'auto', label: 'Auto', hint: 'Omit the reasoning parameter' },
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
): Promise<unknown> {
  const controller = new AbortController();
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
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The AI request timed out. Try a smaller/faster model or a higher thinking budget.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
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
): Promise<string> {
  const key = settings.geminiApiKey.trim();
  const model = settings.geminiModel.trim();
  if (!key) throw new Error('Add a Google Gemini API key in Settings first.');
  if (!model) throw new Error('Add a Gemini model name in Settings first.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const buildBody = (includeThinking: boolean, includeTemperature: boolean) => {
    const generationConfig: Record<string, unknown> = {
      maxOutputTokens,
    };
    if (includeTemperature) generationConfig.temperature = settings.temperature;
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
  let includeTemperature = true;
  let data: unknown;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      data = await postJson(url, headers, buildBody(includeThinking, includeTemperature));
      lastError = undefined;
      break;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('The Gemini request failed.');
      const message = lastError.message;
      if (includeThinking && /thinking|thought|reasoning|budget/i.test(message)) {
        includeThinking = false;
        continue;
      }
      if (includeTemperature && /temperature/i.test(message)) {
        includeTemperature = false;
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
    temperature: settings.temperature,
    max_tokens: maxOutputTokens,
  };
  if (settings.openaiThinking !== 'auto') {
    body.reasoning_effort = settings.openaiThinking;
  }

  let data: unknown;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      data = await postJson(url, headers, body);
      lastError = undefined;
      break;
    } catch (error) {
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
): Promise<string> {
  if (settings.aiProvider === 'gemini') {
    return callGemini(system, user, settings, maxOutputTokens);
  }
  return callOpenAiCompatible(system, user, settings, maxOutputTokens);
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

export interface PracticeGenerationInput {
  word: VocabWord;
  count: number;
  settings: Settings;
}

/**
 * Ask the configured model for more native-language translation prompts.
 * Solutions are deliberately left to Google Translate at reveal time.
 */
export async function generatePracticeSentences({
  word,
  count,
  settings,
}: PracticeGenerationInput): Promise<string[]> {
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);

  const system = `You are an expert ${target.label} teacher and assessment writer. You create clear, level-appropriate translation exercises and always respond with valid JSON only.`;
  const user = `Create ${count} ${native.label} sentences for a ${word.level} (CEFR) learner to translate into ${target.label}.

Target vocabulary: "${word.term}" (${word.partOfSpeech ?? 'word'}) meaning "${word.definition}".
Requirements:
- Each ${native.label} sentence must naturally call for "${word.term}" in its most common ${target.label} translation.
- Match ${word.level} difficulty: vocabulary, grammar, and sentence length should fit that CEFR band.
- Vary the grammar and context. Avoid repeating sentence openings.
- Write only the ${native.label} sentences. Do not include answers, notes, numbering, or translations.
- Return strictly: {"sentences":["sentence 1","sentence 2","..."]}`;

  const raw = await requestText(system, user, settings, 2000);
  const parsed = extractJson(raw);
  const sentences =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { sentences?: unknown }).sentences)
      ? ((parsed as { sentences: unknown[] }).sentences ?? [])
      : [];

  const cleaned = sentences
    .filter((sentence): sentence is string => typeof sentence === 'string')
    .map((sentence) => sentence.trim().replace(/^\d+[.)]\s*/, ''))
    .filter((sentence) => sentence.length > 0);

  if (cleaned.length === 0) {
    throw new Error('The model did not return usable sentences. Try again or adjust the model settings.');
  }
  return Array.from(new Set(cleaned)).slice(0, count);
}

export interface TranslationFeedbackInput {
  word: VocabWord;
  source: string;
  answer: string;
  settings: Settings;
}

export async function evaluateTranslation({
  word,
  source,
  answer,
  settings,
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

  const raw = await requestText(system, user, settings, 1200);
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
