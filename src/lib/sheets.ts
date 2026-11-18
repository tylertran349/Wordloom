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
 * Schema 6 adds the "Wordloom Seen" tab: every word the learner has opened,
 * synced across devices. Requests without a sheet id still use the legacy
 * shared spreadsheet keyed by email.
 */
const BRIDGE_SCHEMA = 6;

const REQUEST_TIMEOUT_MS = 25_000;

export type SheetConnectionKind = 'sheet' | 'legacy';

export interface SheetConnection {
  /** A learner-owned spreadsheet, or the legacy shared sheet. */
  kind: SheetConnectionKind;
  /** Apps Script web app URL, ending in /exec. */
  endpoint: string;
  /** Canonical spreadsheet URL, when known. */
  sheetUrl: string;
  /** The account email. Verified by Google for kind === 'sheet'. */
  email: string;
  /** Spreadsheet id for kind === 'sheet'. */
  sheetId: string;
  /** Per-spreadsheet secret for kind === 'sheet'. */
  secret: string;
  /** Spreadsheet name, when the connect page reported one. */
  name: string;
  /** Optional shared token for the legacy deployment. */
  token: string;
}

export interface SheetConnectionInput {
  email: string;
  sheetId: string;
  sheetUrl: string;
  secret: string;
  name?: string;
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
  /** Local edit time, used to keep autosave in order. */
  localChangedAt: number;
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
  /**
   * Which API-key rows exist in the sheet. This distinguishes a sheet created
   * before keys were synced (no row) from a key the learner deliberately
   * cleared (row with an empty value).
   */
  credentialRows?: {
    geminiApiKey: boolean;
    openaiApiKey: boolean;
  };
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
  code?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The legacy shared connection, keyed by an email inside one spreadsheet. */
export function createLegacyConnection(email = ''): SheetConnection | null {
  if (!SHARED_SHEET_ENDPOINT) return null;
  return {
    kind: 'legacy',
    endpoint: SHARED_SHEET_ENDPOINT,
    sheetUrl: SHARED_SHEET_URL,
    email: normalizeEmail(email),
    sheetId: '',
    secret: '',
    name: '',
    token: SHARED_SYNC_TOKEN,
  };
}

/** A learner-owned spreadsheet connection, ready for the data bridge. */
export function createSheetConnection(input: SheetConnectionInput): SheetConnection | null {
  if (!SHARED_SHEET_ENDPOINT) return null;
  if (!input.sheetId || !input.secret) return null;
  return {
    kind: 'sheet',
    endpoint: SHARED_SHEET_ENDPOINT,
    sheetUrl: input.sheetUrl,
    email: normalizeEmail(input.email),
    sheetId: input.sheetId,
    secret: input.secret,
    name: input.name ?? '',
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
  };
}

function readStoredConnection(value: unknown): SheetConnection | null {
  if (!isRecord(value)) return null;
  const kind = value.kind === 'sheet' ? 'sheet' : value.kind === 'legacy' ? 'legacy' : null;
  if (!kind) return null;
  const endpoint = typeof value.endpoint === 'string' ? value.endpoint.trim() : '';
  if (!endpoint) return null;
  const email = normalizeEmail(typeof value.email === 'string' ? value.email : '');
  const sheetId = typeof value.sheetId === 'string' ? value.sheetId.trim() : '';
  const secret = typeof value.secret === 'string' ? value.secret.trim() : '';
  if (kind === 'sheet' && (!sheetId || !secret)) return null;
  const sheetUrl =
    typeof value.sheetUrl === 'string' && value.sheetUrl
      ? value.sheetUrl
      : kind === 'legacy'
        ? SHARED_SHEET_URL
        : '';
  return {
    kind,
    endpoint,
    sheetUrl,
    email,
    sheetId: kind === 'sheet' ? sheetId : '',
    secret: kind === 'sheet' ? secret : '',
    name: typeof value.name === 'string' ? value.name : '',
    token:
      typeof value.token === 'string' && value.token ? value.token : SHARED_SYNC_TOKEN,
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

    let connection = email ? readStoredConnection(source.connection) : null;
    if (email && !connection) {
      // Pre-schema-5 browsers only stored an email. Keep them on the legacy
      // shared sheet until they connect a spreadsheet of their own.
      connection = createLegacyConnection(email);
    }
    if (!email) connection = null;

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

export function summarizeProgress(progress: ProgressState): SheetSummary {
  return {
    cards: Object.keys(progress.cards).length,
    reviews: progress.reviewCount,
  };
}

export function hasProgressData(progress: ProgressState): boolean {
  return (
    Object.keys(progress.cards).length > 0 ||
    Object.keys(progress.solutions).length > 0 ||
    Object.keys(progress.generatedExamples).length > 0 ||
    Object.keys(progress.generatedPractice).length > 0 ||
    Object.keys(progress.seenWords).length > 0 ||
    progress.reviewLog.length > 0
  );
}

/**
 * AI keys sync only to a learner-owned sheet. The legacy shared sheet is
 * readable by anyone who knows the email, so credentials never go there.
 *
 * Vocabulary changes travel with settings, but a single spreadsheet cell is
 * limited to 50,000 characters. Custom words, built-in edits, and hidden-word
 * ids are split into chunks that are reassembled on read, so large imports
 * still sync cleanly.
 */
const CHUNKED_SETTINGS = ['customWords', 'wordEdits', 'hiddenWords'] as const;
const CHUNK_SIZE = 18_000;

function hasChunkableValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== undefined && value !== null;
}

function packSettingsForSheet(settings: Settings): Record<string, unknown> {
  const packed: Record<string, unknown> = { ...settings };
  CHUNKED_SETTINGS.forEach((field) => {
    const value = packed[field];
    delete packed[field];
    if (!hasChunkableValue(value)) return;

    const json = JSON.stringify(value);
    const count = Math.ceil(json.length / CHUNK_SIZE);
    packed[`${field}ChunkCount`] = count;
    for (let index = 0; index < count; index += 1) {
      packed[`${field}Chunk${index}`] = json.slice(
        index * CHUNK_SIZE,
        (index + 1) * CHUNK_SIZE,
      );
    }
  });
  return packed;
}

function unpackSettingsFromSheet(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };

  CHUNKED_SETTINGS.forEach((field) => {
    // A sheet written by an older/newer build may already carry the field.
    if (next[field] !== undefined) return;

    const count = Number(next[`${field}ChunkCount`]);
    if (!Number.isInteger(count) || count <= 0 || count > 1_000) return;

    let json = '';
    for (let index = 0; index < count; index += 1) {
      const chunk = next[`${field}Chunk${index}`];
      if (typeof chunk !== 'string') return;
      json += chunk;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }

    delete next[`${field}ChunkCount`];
    for (let index = 0; index < count; index += 1) {
      delete next[`${field}Chunk${index}`];
    }
    next[field] = parsed;
  });

  return next;
}

function settingsForSheet(
  connection: SheetConnection,
  settings: Settings,
): Record<string, unknown> {
  const safe =
    connection.kind === 'sheet'
      ? settings
      : { ...settings, geminiApiKey: '', openaiApiKey: '' };
  return packSettingsForSheet(safe);
}

/** Fill in the sheet URL returned by the bridge after the first connection. */
export function attachSheetUrl(
  connection: SheetConnection,
  sheetUrl: string,
): SheetConnection {
  if (!sheetUrl || connection.sheetUrl === sheetUrl) return connection;
  return { ...connection, sheetUrl };
}

async function callBridge(
  url: string,
  kind: SheetConnectionKind,
  init?: RequestInit,
): Promise<BridgeStatePayload> {
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
      'Google Sheets returned an unexpected page. If you manage the bridge, check the web app deployment. Otherwise try again later. Your data is safe in this browser.',
    );
  }

  if (payload.ok === false && !payload.conflict) {
    const message = typeof payload.error === 'string' ? payload.error : '';
    const code = typeof payload.code === 'string' ? payload.code : message;
    if (code === 'unauthorized') {
      throw new Error(
        kind === 'sheet'
          ? 'This spreadsheet is no longer connected to Wordloom. Sign in with Google again from Settings.'
          : 'The shared sync password does not match. Ask the site owner to check the sheet setup.',
      );
    }
    if (code === 'no-access' && kind === 'sheet') {
      throw new Error(
        'Wordloom could not open this spreadsheet. It may have been deleted or the share was removed. Your data is safe in this browser.',
      );
    }
    throw new Error(
      message || 'Google Sheets could not complete the request. Try again in a moment.',
    );
  }

  return payload;
}

function snapshotFromPayload(
  payload: BridgeStatePayload,
  fallbackUrl: string,
): SheetSnapshot | null {
  const state = payload.state;
  if (!state || !isRecord(state)) return null;
  const rawSettings = unpackSettingsFromSheet(
    isRecord(state.settings) ? state.settings : {},
  );
  return {
    updatedAt: numberOr(state.updatedAt, numberOr(payload.updatedAt, 0)),
    sheetUrl:
      typeof payload.sheetUrl === 'string' && payload.sheetUrl ? payload.sheetUrl : fallbackUrl,
    settings: parseStoredSettings(JSON.stringify(rawSettings)),
    progress: parseStoredProgress(JSON.stringify(state.progress ?? null)),
    credentialRows: {
      geminiApiKey: Object.prototype.hasOwnProperty.call(rawSettings, 'geminiApiKey'),
      openaiApiKey: Object.prototype.hasOwnProperty.call(rawSettings, 'openaiApiKey'),
    },
  };
}

function assertBridgeSchema(payload: BridgeStatePayload): void {
  if (payload.schema === undefined) return;
  if (numberOr(payload.schema, 0) === BRIDGE_SCHEMA) return;
  throw new Error(
    'Google Sheets sync needs a one-time update. If you manage the Google side, redeploy the latest Apps Script bridge. Otherwise, ask the site owner to update it. Your data is safe in this browser.',
  );
}

export async function readSheet(
  connection: SheetConnection,
  email = connection.email,
): Promise<SheetReadResult> {
  const url = new URL(connection.endpoint);
  url.searchParams.set('action', 'read');
  url.searchParams.set(
    'email',
    normalizeEmail(connection.kind === 'sheet' ? connection.email : email),
  );
  if (connection.kind === 'sheet') {
    url.searchParams.set('sheetId', connection.sheetId);
    url.searchParams.set('secret', connection.secret);
  }
  if (connection.token) url.searchParams.set('token', connection.token);
  url.searchParams.set('_', String(Date.now()));

  const payload = await callBridge(url.toString(), connection.kind);
  assertBridgeSchema(payload);
  const snapshot = snapshotFromPayload(payload, connection.sheetUrl);
  if (!snapshot) {
    throw new Error(
      'Google Sheets returned no Wordloom data. Try again, or check the spreadsheet in Settings.',
    );
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
    settings: settingsForSheet(connection, payload.settings),
    progress: payload.progress,
    ...(connection.kind === 'sheet'
      ? { sheetId: connection.sheetId, secret: connection.secret }
      : {}),
  });

  const response = await callBridge(connection.endpoint, connection.kind, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  });
  assertBridgeSchema(response);

  if (response.conflict) {
    const snapshot = snapshotFromPayload(response, connection.sheetUrl);
    if (!snapshot) {
      throw new Error(
        'Google Sheets changed on another device and the new copy could not be read. Try again.',
      );
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
      settings: settingsForSheet(connection, payload.settings),
      progress: payload.progress,
      ...(connection.kind === 'sheet'
        ? { sheetId: connection.sheetId, secret: connection.secret }
        : {}),
    });
    return navigator.sendBeacon(
      connection.endpoint,
      new Blob([body], { type: 'text/plain;charset=UTF-8' }),
    );
  } catch {
    return false;
  }
}
