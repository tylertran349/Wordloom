import type { ProgressState, Settings } from '../types';
import { parseStoredProgress, parseStoredSettings } from './storage';
import {
  SHARED_SHEET_ENDPOINT,
  SHARED_SHEET_URL,
  SHARED_SYNC_TOKEN,
} from './site';

/** Local cache of the Google Sheets connection. */
const SHEETS_STORAGE_KEY = 'wordloom.sheets.v1';

/**
 * The bridge schema that understands per-email rows. An older deployment
 * (schema 3) would ignore the email and hand every visitor the owner's data,
 * so refuse to read or write until the owner updates the Apps Script.
 */
const BRIDGE_SCHEMA = 4;

const REQUEST_TIMEOUT_MS = 25_000;

export interface SheetConnection {
  /** Canonical spreadsheet URL, when known. */
  sheetUrl: string;
  /** Apps Script web app URL, ending in /exec. */
  endpoint: string;
  token: string;
}

export interface SheetSyncState {
  connection: SheetConnection | null;
  /** The learner's email. Blank means local-only. */
  email: string;
  deviceId: string;
  /** Server timestamp of the last remote copy this device saw. */
  lastRemoteUpdatedAt: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** Local changes exist that have not reached the sheet yet. */
  dirty: boolean;
  /** Local edit time, used to settle a simultaneous-edit conflict. */
  localChangedAt: number;
  /** Local and sheet both had data when the connection was made. */
  pendingDecision: boolean;
  remoteSummary: SheetSummary | null;
}

export interface SheetSummary {
  cards: number;
  reviews: number;
}

export interface SheetSnapshot {
  updatedAt: number;
  sheetUrl: string;
  settings: Settings;
  progress: ProgressState;
}

export interface SheetReadResult {
  updatedAt: number;
  sheetUrl: string;
  snapshot: SheetSnapshot;
  summary: SheetSummary;
  hasData: boolean;
}

export interface SheetWritePayload {
  email: string;
  settings: Settings;
  progress: ProgressState;
  deviceId: string;
  /** The remote timestamp this write is based on; 0 forces an overwrite. */
  baseUpdatedAt: number;
}

export interface SheetWriteResult {
  updatedAt: number;
  sheetUrl: string;
  conflict?: {
    updatedAt: number;
    snapshot: SheetSnapshot;
    summary: SheetSummary;
  };
}

interface BridgeStatePayload {
  state?: {
    updatedAt?: unknown;
    settings?: unknown;
    progress?: unknown;
  };
  updatedAt?: unknown;
  sheetUrl?: unknown;
  schema?: unknown;
  error?: unknown;
  conflict?: unknown;
  ok?: unknown;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!email || email.length > 200 || /\s/.test(email)) return false;
  const at = email.indexOf('@');
  const dot = email.lastIndexOf('.');
  return at > 0 && dot > at + 1 && dot < email.length - 1;
}

/** The one shared connection for the site, or null when it is not configured. */
export function createSharedConnection(): SheetConnection | null {
  if (!SHARED_SHEET_ENDPOINT) return null;
  return {
    sheetUrl: SHARED_SHEET_URL,
    endpoint: SHARED_SHEET_ENDPOINT,
    token: SHARED_SYNC_TOKEN,
  };
}

function createDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the random id below.
  }
  return `device-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function defaultSheetSync(): SheetSyncState {
  return {
    connection: null,
    email: '',
    deviceId: createDeviceId(),
    lastRemoteUpdatedAt: 0,
    lastSyncedAt: null,
    lastError: null,
    dirty: false,
    localChangedAt: 0,
    pendingDecision: false,
    remoteSummary: null,
  };
}

export function loadSheetSync(): SheetSyncState {
  const base = defaultSheetSync();
  try {
    const raw = window.localStorage.getItem(SHEETS_STORAGE_KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
    const source = parsed as Record<string, unknown>;
    const email = normalizeEmail(typeof source.email === 'string' ? source.email : '');
    // The old device-level connection is intentionally dropped. The site now
    // uses one shared bridge and asks each learner to enter an email.
    const connection = email ? createSharedConnection() : null;
    return {
      connection,
      email,
      deviceId:
        typeof source.deviceId === 'string' && source.deviceId ? source.deviceId : base.deviceId,
      lastRemoteUpdatedAt: email ? numberOr(source.lastRemoteUpdatedAt, 0) : 0,
      lastSyncedAt:
        email && source.lastSyncedAt !== null
          ? numberOr(source.lastSyncedAt, 0) || null
          : null,
      lastError: email && typeof source.lastError === 'string' ? source.lastError : null,
      dirty: Boolean(email) && source.dirty === true,
      localChangedAt: email ? numberOr(source.localChangedAt, 0) : 0,
      pendingDecision: Boolean(email) && source.pendingDecision === true,
      remoteSummary:
        email && isSummary(source.remoteSummary) ? source.remoteSummary : null,
    };
  } catch {
    return base;
  }
}

export function saveSheetSync(state: SheetSyncState): void {
  try {
    window.localStorage.setItem(SHEETS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sync still works for this session if the config cannot be saved.
  }
}

function numberOr(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isSummary(value: unknown): value is SheetSummary {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.cards === 'number' && typeof entry.reviews === 'number';
}

export function summarizeProgress(progress: ProgressState): SheetSummary {
  return {
    cards: Object.keys(progress.cards).length,
    reviews: progress.reviewCount,
  };
}

export function hasProgressData(progress: ProgressState): boolean {
  return (
    Object.keys(progress.cards).length > 0 ||
    Object.keys(progress.responses).length > 0 ||
    Object.keys(progress.solutions).length > 0 ||
    Object.keys(progress.generatedExamples).length > 0 ||
    Object.keys(progress.generatedPractice).length > 0 ||
    progress.reviewLog.length > 0
  );
}

/**
 * API keys stay on the device that typed them. The sheet is a shared document
 * and may be visible to other people, so credentials never travel with it.
 */
export function withoutSecrets(settings: Settings): Settings {
  return { ...settings, geminiApiKey: '', openaiApiKey: '' };
}

/** Fill in the sheet URL returned by the bridge after the first connection. */
export function attachSheetUrl(
  connection: SheetConnection,
  sheetUrl: string,
): SheetConnection {
  if (!sheetUrl || connection.sheetUrl === sheetUrl) return connection;
  return { ...connection, sheetUrl };
}

async function callBridge(url: string, init?: RequestInit): Promise<BridgeStatePayload> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let text = '';
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `Google Sheets returned an error (HTTP ${response.status}). Try again in a moment. Your data is safe in this browser.`,
      );
    }
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        'Google Sheets took too long to respond. Check your connection and try again. Your data is safe in this browser.',
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Could not reach Google Sheets. Check your internet connection and any ad blocker, then try again. Your data is safe in this browser.',
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }

  let payload: BridgeStatePayload;
  try {
    payload = JSON.parse(text) as BridgeStatePayload;
  } catch {
    throw new Error(
      'Google Sheets returned an unexpected page. If you manage the sheet, check the web app deployment. Otherwise try again later. Your data is safe in this browser.',
    );
  }

  if (payload.ok === false && !payload.conflict) {
    const message = typeof payload.error === 'string' ? payload.error : '';
    if (message === 'unauthorized') {
      throw new Error('The shared sync password does not match. Ask the site owner to check the sheet setup.');
    }
    throw new Error(message || 'Google Sheets could not complete the request. Try again in a moment.');
  }

  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotFromPayload(
  payload: BridgeStatePayload,
  fallbackUrl: string,
): SheetSnapshot | null {
  const state = payload.state;
  if (!state || !isRecord(state)) return null;
  return {
    updatedAt: numberOr(state.updatedAt, numberOr(payload.updatedAt, 0)),
    sheetUrl:
      typeof payload.sheetUrl === 'string' && payload.sheetUrl ? payload.sheetUrl : fallbackUrl,
    settings: parseStoredSettings(JSON.stringify(state.settings ?? {})),
    progress: parseStoredProgress(JSON.stringify(state.progress ?? null)),
  };
}

function assertBridgeSchema(payload: BridgeStatePayload): void {
  if (payload.schema === undefined) return;
  if (numberOr(payload.schema, 0) === BRIDGE_SCHEMA) return;
  throw new Error(
    'Google Sheets sync needs a one-time update. If you manage the sheet, open Settings → Google Sheets → Site owner setup and deploy the latest bridge. Otherwise, ask the site owner to update it. Your data is safe in this browser.',
  );
}

export async function readSheet(
  connection: SheetConnection,
  email: string,
): Promise<SheetReadResult> {
  const url = new URL(connection.endpoint);
  url.searchParams.set('action', 'read');
  url.searchParams.set('email', normalizeEmail(email));
  if (connection.token) url.searchParams.set('token', connection.token);
  url.searchParams.set('_', String(Date.now()));

  const payload = await callBridge(url.toString());
  assertBridgeSchema(payload);
  const snapshot = snapshotFromPayload(payload, connection.sheetUrl);
  if (!snapshot) {
    throw new Error('Google Sheets returned no Wordloom data. Try again, or ask the site owner to check the sheet.');
  }
  return {
    updatedAt: snapshot.updatedAt,
    sheetUrl: snapshot.sheetUrl,
    snapshot,
    summary: summarizeProgress(snapshot.progress),
    hasData: snapshot.updatedAt > 0 || hasProgressData(snapshot.progress),
  };
}

export async function writeSheet(
  connection: SheetConnection,
  payload: SheetWritePayload,
): Promise<SheetWriteResult> {
  const body = JSON.stringify({
    action: 'write',
    token: connection.token,
    email: normalizeEmail(payload.email),
    deviceId: payload.deviceId,
    baseUpdatedAt: payload.baseUpdatedAt,
    settings: withoutSecrets(payload.settings),
    progress: payload.progress,
  });

  const response = await callBridge(connection.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  });
  assertBridgeSchema(response);

  if (response.conflict) {
    const snapshot = snapshotFromPayload(response, connection.sheetUrl);
    if (!snapshot) {
      throw new Error('Google Sheets changed on another device and the new copy could not be read. Try again.');
    }
    return {
      updatedAt: snapshot.updatedAt,
      sheetUrl: snapshot.sheetUrl,
      conflict: {
        updatedAt: snapshot.updatedAt,
        snapshot,
        summary: summarizeProgress(snapshot.progress),
      },
    };
  }

  return {
    updatedAt: numberOr(response.updatedAt, Date.now()),
    sheetUrl:
      typeof response.sheetUrl === 'string' && response.sheetUrl
        ? response.sheetUrl
        : connection.sheetUrl,
  };
}

/** Best-effort save when the tab is closing; the response is not read. */
export function beaconSheet(connection: SheetConnection, payload: SheetWritePayload): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
    const body = JSON.stringify({
      action: 'write',
      token: connection.token,
      email: normalizeEmail(payload.email),
      deviceId: payload.deviceId,
      baseUpdatedAt: payload.baseUpdatedAt,
      settings: withoutSecrets(payload.settings),
      progress: payload.progress,
    });
    return navigator.sendBeacon(
      connection.endpoint,
      new Blob([body], { type: 'text/plain;charset=UTF-8' }),
    );
  } catch {
    return false;
  }
}
