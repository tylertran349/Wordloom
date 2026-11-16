import type { CEFRLevel } from '../types';
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

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
