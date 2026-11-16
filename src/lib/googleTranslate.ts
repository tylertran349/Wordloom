const CACHE_KEY = 'wordloom.translations.v1';
const MAX_CACHE_ENTRIES = 400;

const cache = new Map<string, string>();
let cacheLoaded = false;
let persistTimer: number | undefined;

function cacheKey(text: string, from: string, to: string): string {
  return `${from}|${to}|${text}`;
}

function loadCache(): void {
  if (cacheLoaded || typeof window === 'undefined') return;
  cacheLoaded = true;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string') cache.set(key, value);
    });
  } catch {
    // Cache is optional.
  }
}

function persistCache(): void {
  if (typeof window === 'undefined') return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    try {
      const entries = Array.from(cache.entries()).slice(-MAX_CACHE_ENTRIES);
      if (entries.length === 0) {
        window.localStorage.removeItem(CACHE_KEY);
      } else {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
      }
    } catch {
      // Ignore storage failures.
    }
  }, 180);
}

function remember(key: string, translation: string): void {
  cache.set(key, translation);
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  persistCache();
}

async function fetchJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Translation service returned HTTP ${response.status}.`);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  try {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  } catch {
    return value;
  }
}

async function googleFreeEndpoint(text: string, from: string, to: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google Translate returned an unexpected response.');
  }
  const translated = (data[0] as unknown[])
    .map((part) => (Array.isArray(part) && typeof part[0] === 'string' ? part[0] : ''))
    .join('')
    .trim();
  if (!translated) throw new Error('Google Translate returned an empty translation.');
  return decodeEntities(translated);
}

async function myMemoryEndpoint(text: string, from: string, to: string): Promise<string> {
  const url =
    'https://api.mymemory.translated.net/get' +
    `?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from)}%7C${encodeURIComponent(to)}`;
  const data = await fetchJson(url);
  if (!data || typeof data !== 'object') {
    throw new Error('The fallback translation service returned an unexpected response.');
  }
  const responseData = (data as { responseData?: { translatedText?: unknown } }).responseData;
  const responseStatus = (data as { responseStatus?: unknown }).responseStatus;
  if (responseStatus !== undefined && Number(responseStatus) >= 400) {
    throw new Error('The fallback translation service refused the request.');
  }
  const translation = responseData?.translatedText;
  if (typeof translation !== 'string' || !translation.trim()) {
    throw new Error('The fallback translation service returned no translation.');
  }
  if (
    /MYMEMORY WARNING|YOU USED ALL AVAILABLE FREE TRANSLATIONS|INVALID LANGUAGE PAIR|QUERY LENGTH LIMIT/i.test(
      translation,
    )
  ) {
    throw new Error('The fallback translation service refused the request.');
  }
  return decodeEntities(translation.trim());
}

export interface TranslationResult {
  text: string;
  provider: 'google' | 'mymemory' | 'cache';
}

/**
 * Translate with Google's free web endpoint — no API key required.
 * Falls back to MyMemory's free endpoint if Google is blocked by the network,
 * and caches successful translations in localStorage.
 */
export async function translateFree(
  text: string,
  from: string,
  to: string,
): Promise<TranslationResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('There is nothing to translate.');
  if (trimmed.length > 1800) throw new Error('This sentence is too long to translate.');

  loadCache();
  const key = cacheKey(trimmed, from, to);
  const cached = cache.get(key);
  if (cached) return { text: cached, provider: 'cache' };

  try {
    const translation = await googleFreeEndpoint(trimmed, from, to);
    remember(key, translation);
    return { text: translation, provider: 'google' };
  } catch (googleError) {
    try {
      const translation = await myMemoryEndpoint(trimmed, from, to);
      remember(key, translation);
      return { text: translation, provider: 'mymemory' };
    } catch {
      throw googleError instanceof Error
        ? googleError
        : new Error('Translation failed. Open Google Translate directly instead.');
    }
  }
}

export function buildGoogleTranslateUrl(text: string, from: string, to: string): string {
  const params = new URLSearchParams({
    sl: from,
    tl: to,
    text,
    op: 'translate',
  });
  return `https://translate.google.com/?${params.toString()}`;
}

export function clearTranslationCache(): number {
  if (persistTimer) {
    window.clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  const count = cache.size;
  cache.clear();
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // No-op.
  }
  return count;
}

export function translationCacheSize(): number {
  loadCache();
  return cache.size;
}
