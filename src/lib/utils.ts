import type { CEFRLevel, NewWordOrder, VocabWord } from '../types';
import { CEFR_LEVELS } from '../types';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

/** Pick a uniformly random element, or undefined for an empty list. */
export function pickRandom<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  return values[Math.floor(Math.random() * values.length)];
}

/**
 * Choose which new word the learner studies next. Words already in the
 * review queue or seen before are never offered. When `order` is 'random'
 * a fresh random candidate is chosen on every call, so each "study next
 * word" action is random instead of following a fixed shuffle.
 */
export function pickNextNewWord(
  words: VocabWord[],
  order: NewWordOrder,
  cards: Record<string, unknown>,
  seenWords: Record<string, unknown>,
  excludeId?: string,
): VocabWord | undefined {
  const candidates = words.filter(
    (word) => word.id !== excludeId && !cards[word.id] && !seenWords[word.id],
  );
  return order === 'random' ? pickRandom(candidates) : candidates[0];
}

/**
 * Deterministic Fisher–Yates shuffle. The same seed and input always produce
 * the same order, so a learner's randomized deck stays stable between visits
 * while still being unrelated to the vocabulary file's topic grouping.
 */
export function seededShuffle<T>(values: T[], seed: number): T[] {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function isCEFRLevel(value: string | undefined): value is CEFRLevel {
  return Boolean(value) && (CEFR_LEVELS as string[]).includes(value as string);
}

/**
 * Collect the AI-generated native-language exercise sentences for a word.
 * Sentences are generated on demand and cached in local progress.
 */
export function getPracticeSentences(count: number, generated: string[] = []): string[] {
  const aiGenerated = generated.filter((sentence) => sentence.trim().length > 0);
  return unique(aiGenerated).slice(0, Math.max(0, count));
}

/** Exercise list shown on the study page: every AI-generated sentence. */
export function getStudySentences(generated: string[] = []): string[] {
  return unique(generated.filter((sentence) => sentence.trim().length > 0));
}

export function dayKey(date: Date | number = new Date()): string {
  const value = typeof date === 'number' ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfDay(date: Date | number = new Date()): Date {
  const value = typeof date === 'number' ? new Date(date) : new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date | number = new Date()): Date {
  const value = startOfDay(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function addDays(date: Date | number, days: number): Date {
  const value = typeof date === 'number' ? new Date(date) : new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function formatLongDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatShortDate(date: Date | number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(typeof date === 'number' ? new Date(date) : date);
}

export function formatInterval(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'now';
  if (days < 1 / 24) {
    const minutes = Math.max(1, Math.round(days * 24 * 60));
    return `${minutes} min`;
  }
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours} hr`;
  }
  if (days < 30) return `${Math.round(days)} ${pluralize(Math.round(days), 'day')}`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} ${pluralize(months, 'month')}`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} ${pluralize(years, 'year')}`;
}

export function formatDue(due: number, now = Date.now()): string {
  const difference = due - now;
  const absolute = Math.abs(difference);
  if (absolute < 60_000) return difference <= 0 ? 'due now' : 'in a moment';
  const minutes = Math.round(absolute / 60_000);
  if (minutes < 60) return difference < 0 ? `${minutes} min ago` : `in ${minutes} min`;
  const hours = Math.round(absolute / 3_600_000);
  if (hours < 24) return difference < 0 ? `${hours} hr ago` : `in ${hours} hr`;
  const days = Math.round(absolute / 86_400_000);
  if (days < 30) return difference < 0 ? `${days} d ago` : `in ${days} d`;
  const months = Math.round(days / 30);
  return difference < 0 ? `${months} mo ago` : `in ${months} mo`;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trimEnd()}…`;
}

const TYPOGRAPHIC_APOSTROPHES = /[\u2018\u2019\u02bc\u00b4]/g;

function foldForComparison(value: string): string {
  return value
    .normalize('NFC')
    .replace(TYPOGRAPHIC_APOSTROPHES, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Check whether a translation visibly uses the studied term. Comparison ignores
 * case, spacing, and apostrophe style but keeps diacritics, so Vietnamese words
 * such as "má" and "mà" do not collide. Inflections are only caught when they
 * keep the term intact ("run" inside "running"), so this is a hint rather than
 * a strict assertion.
 */
export function containsTerm(text: string, term: string): boolean {
  const needle = foldForComparison(term);
  if (!needle) return true;
  return foldForComparison(text).includes(needle);
}

export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
}

/**
 * Copy text to the clipboard, falling back to a temporary textarea on browsers
 * where the async Clipboard API is missing or blocked (non-HTTPS origins,
 * older Safari, denied permissions).
 */
export async function copyText(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy selection-based copy below.
    }
  }
  if (typeof document === 'undefined') return false;
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  const selection = window.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
    previouslyFocused?.focus({ preventScroll: true });
  }
}
