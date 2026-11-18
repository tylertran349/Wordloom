import { isValidEmail, type SheetConnectionInput } from './sheets';
import { SHARED_CONNECT_ENDPOINT } from './site';

/** Whether this page load came back from the connect flow. */
let openSheetsTab = false;
/** One-time nonce that proves this browser started the connect flow. */
const NONCE_KEY = 'wordloom.sheets.nonce';
const NONCE_TTL_MS = 60 * 60 * 1000;

/** Connection handed back by the Google connect page. */
let pending: SheetConnectionInput | null = null;
/** Why a returned connection was rejected, when it was. */
let returnError: string | null = null;

function createNonce(): string {
  try {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

function storeNonce(nonce: string): void {
  try {
    window.localStorage.setItem(NONCE_KEY, JSON.stringify({ nonce, at: Date.now() }));
  } catch {
    // Without storage the return will be rejected; the user can retry.
  }
}

/**
 * Read and clear the nonce. localStorage (not sessionStorage) so the return
 * link still works if it opens in a new tab; the nonce is still unguessable
 * outside this origin.
 */
function takeNonce(): string {
  try {
    const raw = window.localStorage.getItem(NONCE_KEY);
    if (!raw) return '';
    window.localStorage.removeItem(NONCE_KEY);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return '';
    const entry = value as Record<string, unknown>;
    const nonce = typeof entry.nonce === 'string' ? entry.nonce : '';
    const at = typeof entry.at === 'number' ? entry.at : 0;
    if (!nonce || Date.now() - at > NONCE_TTL_MS) return '';
    return nonce;
  } catch {
    return '';
  }
}

/**
 * Build the full-page Google sign-in URL. Wordloom returns to the same page
 * after the connect flow, so a popup (and its blockers) is never involved.
 */
export function startSheetConnect(): string | null {
  if (!SHARED_CONNECT_ENDPOINT) return null;
  if (typeof window === 'undefined') return null;
  returnError = null;
  const returnTo = `${window.location.origin}${window.location.pathname}`;
  const url = new URL(SHARED_CONNECT_ENDPOINT);

  // A nonce stored in this browser proves the returned connection was started
  // here, not injected through a crafted link.
  const nonce = createNonce();
  storeNonce(nonce);

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
  if (!payload) {
    returnError = 'The Google Sheets connection could not be read. Try signing in again.';
    markReturnedTab();
    return;
  }

  // Reject a connection that did not originate from this browser's sign-in.
  const expected = takeNonce();
  if (!expected || payload.nonce !== expected) {
    returnError = 'The Google Sheets sign-in expired or was started elsewhere. Try again.';
    markReturnedTab();
    return;
  }

  pending = payload;
  markReturnedTab();
}

function markReturnedTab(): void {
  openSheetsTab = true;
}

/** The connection captured at startup, if any. Safe to call repeatedly. */
export function getReturningConnection(): SheetConnectionInput | null {
  return pending;
}

/** A message explaining why a returned connection was rejected, if it was. */
export function takeConnectError(): string | null {
  return returnError;
}

/** Whether Settings should open on the Google Sheets tab for this load. */
export function consumeSheetTabRequest(): boolean {
  return openSheetsTab;
}

/** Clear the one-time tab request after Settings has read it. */
export function clearSheetTabRequest(): void {
  openSheetsTab = false;
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
