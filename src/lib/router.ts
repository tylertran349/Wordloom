import type { Route } from '../types';
import { isCEFRLevel } from './utils';

export type { Route };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleaned) return { name: 'dashboard' };
  const parts = cleaned.split('/').map(safeDecode);

  if (parts[0] === 'level' && isCEFRLevel(parts[1])) {
    return { name: 'level', level: parts[1] };
  }
  if (parts[0] === 'word' && isCEFRLevel(parts[1]) && parts[2]) {
    return { name: 'word', level: parts[1], wordId: parts[2] };
  }
  if (parts[0] === 'review') {
    return { name: 'review', practice: parts[1] === 'practice' };
  }
  if (parts[0] === 'progress') return { name: 'progress' };
  if (parts[0] === 'import') {
    return { name: 'import', level: isCEFRLevel(parts[1]) ? parts[1] : undefined };
  }
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'dashboard' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/';
    case 'level':
      return `#/level/${route.level}`;
    case 'word':
      return `#/word/${route.level}/${encodeURIComponent(route.wordId)}`;
    case 'review':
      return route.practice ? '#/review/practice' : '#/review';
    case 'progress':
      return '#/progress';
    case 'import':
      return route.level ? `#/import/${route.level}` : '#/import';
    case 'settings':
      return '#/settings';
    default:
      return '#/';
  }
}

export function navigate(route: Route): void {
  const next = routeToHash(route);
  if (window.location.hash === next) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = next;
}

export function routeKey(route: Route): string {
  switch (route.name) {
    case 'word':
      return `word:${route.level}:${route.wordId}`;
    case 'level':
      return `level:${route.level}`;
    case 'review':
      return route.practice ? 'review:practice' : 'review';
    case 'import':
      return `import:${route.level ?? 'any'}`;
    default:
      return route.name;
  }
}
