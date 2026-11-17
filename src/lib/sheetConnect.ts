import { isValidEmail, type SheetConnectionInput } from './sheets';
import { SHARED_CONNECT_ENDPOINT } from './site';

/** sessionStorage key that tells Settings to open the Sheets tab on return. */
const RETURNED_TAB_KEY = 'wordloom.sheets.returned';
/** sessionStorage key for the one-time nonce that proves this tab started the flow. */
const NONCE_KEY = 'wordloom.sheets.nonce';

/** Connection handed back by the Google connect page. */
let pending: SheetConnectionInput | null = null;

export function isSheetConnectConfigured(): boolean {
  return Boolean(SHARED_CONNECT_ENDPOINT);
}

function createNonce(): string {
  try {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Build the full-page Google sign-in URL. Wordloom returns to the same page
 * after the connect flow, so a popup (and its blockers) is never involved.
 */
export function startSheetConnect(): string | null {
  if (!SHARED_CONNECT_ENDPOINT) return null;
  if (typeof window === 'undefined') return null;
  const returnTo = `${window.location.origin}${window.location.pathname}`;
  const url = new URL(SHARED_CONNECT_ENDPOINT);

  // A nonce stored in this tab proves the returned connection was started
  // here, not injected through a crafted link.
  const nonce = createNonce();
  try {
    window.sessionStorage.setItem(NONCE_KEY, nonce);
  } catch {
    // Without storage the return will be rejected; the user can retry.
  }

  url.searchParams.set('page', 'connect');
  url.searchParams.set('return', returnTo);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('v', '5');
  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

/**
 * Read the connection from the URL fragment and strip it from the address bar
 * before React routes. The fragment keeps the secret out of server logs and
 * Referer headers.
 */
export function captureReturningConnection(): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  const marker = 'wl_connect=';
  const at = hash.indexOf(marker);
  if (at === -1) return;

  const rest = hash.slice(at + marker.length);
  const end = rest.search(/[&]/);
  const raw = end === -1 ? rest : rest.slice(0, end);
  const before = hash.slice(0, at).replace(/[?&]+$/, '');
  const cleanHash = before && before !== '#' ? before : '#/settings';

  try {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${cleanHash}`,
    );
  } catch {
    // An unreplaced URL is cosmetic; the payload is still read below.
  }

  const payload = decodePayload(raw);
  if (!payload) return;

  // Reject a connection that did not originate from this tab's sign-in click.
  let expected = '';
  try {
    expected = window.sessionStorage.getItem(NONCE_KEY) ?? '';
    window.sessionStorage.removeItem(NONCE_KEY);
  } catch {
    expected = '';
  }
  if (!expected || payload.nonce !== expected) return;

  pending = payload;
  try {
    window.sessionStorage.setItem(RETURNED_TAB_KEY, '1');
  } catch {
    // The tab just opens on General if storage is unavailable.
  }
}

/** The connection captured at startup, if any. Safe to call repeatedly. */
export function getReturningConnection(): SheetConnectionInput | null {
  return pending;
}

/** Whether Settings should open on the Google Sheets tab for this load. */
export function consumeSheetTabRequest(): boolean {
  try {
    if (window.sessionStorage.getItem(RETURNED_TAB_KEY) !== '1') return false;
    window.sessionStorage.removeItem(RETURNED_TAB_KEY);
    return true;
  } catch {
    return false;
  }
}

function decodePayload(
  raw: string,
): (SheetConnectionInput & { nonce: string }) | null {
  if (!raw) return null;
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const source = value as Record<string, unknown>;
    const email = typeof source.email === 'string' ? source.email.trim().toLowerCase() : '';
    const sheetId = typeof source.sheetId === 'string' ? source.sheetId.trim() : '';
    const sheetUrl = typeof source.sheetUrl === 'string' ? source.sheetUrl.trim() : '';
    const secret = typeof source.secret === 'string' ? source.secret.trim() : '';
    const name = typeof source.name === 'string' ? source.name.slice(0, 120) : '';
    const nonce = typeof source.nonce === 'string' ? source.nonce.trim() : '';

    if (!isValidEmail(email)) return null;
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(sheetId)) return null;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(secret)) return null;
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) return null;
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(sheetUrl)) {
      return null;
    }

    return { email, sheetId, sheetUrl, secret, name, nonce };
  } catch {
    return null;
  }
}
