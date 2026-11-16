import type { ProgressState, Settings } from '../types';
import { parseStoredProgress, parseStoredSettings } from './storage';

/** Local cache of the Google Sheets connection. */
export const SHEETS_STORAGE_KEY = 'wordloom.sheets.v1';

const BRIDGE_PATTERN =
  /https:\/\/script\.google\.com\/(?:macros\/s|a\/macros\/[^/\s]+\/s)\/[A-Za-z0-9_-]+\/(?:exec|dev)/;
const SHEET_PATTERN = /https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/;

const REQUEST_TIMEOUT_MS = 25_000;

export interface SheetConnection {
  /** Canonical spreadsheet URL, when known. */
  sheetUrl: string;
  spreadsheetId: string;
  /** Apps Script web app URL, ending in /exec. */
  endpoint: string;
  token: string;
}

export interface SheetSyncState {
  connection: SheetConnection | null;
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
  drafts: number;
  words: number;
  reviewLog: number;
}

export interface SheetSnapshot {
  updatedAt: number;
  sheetUrl: string;
  deviceId?: string;
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

export interface ParsedConnection {
  connection?: SheetConnection;
  error?: string;
}

interface BridgeStatePayload {
  state?: {
    updatedAt?: unknown;
    deviceId?: unknown;
    settings?: unknown;
    progress?: unknown;
  };
  updatedAt?: unknown;
  sheetUrl?: unknown;
  error?: unknown;
  conflict?: unknown;
  ok?: unknown;
}

export function createDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the random id below.
  }
  return `device-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function defaultSheetSync(): SheetSyncState {
  return {
    connection: null,
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
    const connectionRaw = source.connection;
    let connection: SheetConnection | null = null;
    if (connectionRaw && typeof connectionRaw === 'object') {
      const entry = connectionRaw as Record<string, unknown>;
      if (typeof entry.endpoint === 'string' && entry.endpoint) {
        connection = {
          sheetUrl: typeof entry.sheetUrl === 'string' ? entry.sheetUrl : '',
          spreadsheetId: typeof entry.spreadsheetId === 'string' ? entry.spreadsheetId : '',
          endpoint: entry.endpoint,
          token: typeof entry.token === 'string' ? entry.token : '',
        };
      }
    }
    return {
      connection,
      deviceId:
        typeof source.deviceId === 'string' && source.deviceId ? source.deviceId : base.deviceId,
      lastRemoteUpdatedAt: numberOr(source.lastRemoteUpdatedAt, 0),
      lastSyncedAt: source.lastSyncedAt === null ? null : numberOr(source.lastSyncedAt, 0) || null,
      lastError: typeof source.lastError === 'string' ? source.lastError : null,
      dirty: source.dirty === true,
      localChangedAt: numberOr(source.localChangedAt, 0),
      pendingDecision: source.pendingDecision === true,
      remoteSummary: isSummary(source.remoteSummary) ? source.remoteSummary : null,
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
    drafts: Object.keys(progress.responses).length,
    words:
      Object.keys(progress.generatedExamples).length +
      Object.keys(progress.generatedPractice).length,
    reviewLog: progress.reviewLog.length,
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

export function parseConnectionInput(input: {
  sheetUrl: string;
  endpoint: string;
  token: string;
}): ParsedConnection {
  const sheetText = input.sheetUrl.trim();
  const endpointText = input.endpoint.trim();
  const combined = `${sheetText}\n${endpointText}`;

  const endpointMatch = endpointText.match(BRIDGE_PATTERN) ?? combined.match(BRIDGE_PATTERN);
  const endpoint = endpointMatch?.[0] ?? '';
  const sheetMatch = sheetText.match(SHEET_PATTERN) ?? combined.match(SHEET_PATTERN);
  const sheetUrl = sheetMatch?.[0] ?? '';

  if (!endpoint) {
    if (/script\.google\.com/i.test(combined)) {
      return {
        error:
          'That looks like the Apps Script editor URL. Copy the Web app URL from Deploy → Manage deployments; it ends in /exec.',
      };
    }
    return {
      error:
        'Paste the Apps Script Web app URL (it starts with https://script.google.com/macros/s/ and ends in /exec).',
    };
  }

  return {
    connection: {
      sheetUrl,
      spreadsheetId: sheetUrl ? extractSpreadsheetId(sheetUrl) : '',
      endpoint,
      token: (input.token.trim() || combined.match(/Token:\s*(\S+)/)?.[1] || '').slice(0, 200),
    },
  };
}

function extractSpreadsheetId(url: string): string {
  const match = url.match(/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? '';
}

/** Fill in the sheet URL returned by the bridge after the first connection. */
export function attachSheetUrl(
  connection: SheetConnection,
  sheetUrl: string,
): SheetConnection {
  if (!sheetUrl) return connection;
  if (connection.sheetUrl === sheetUrl && connection.spreadsheetId) return connection;
  return { ...connection, sheetUrl, spreadsheetId: extractSpreadsheetId(sheetUrl) };
}

export function buildSyncLink(connection: SheetConnection): string {
  const lines = ['Wordloom sync'];
  if (connection.sheetUrl) lines.push(`Sheet: ${connection.sheetUrl}`);
  lines.push(`Bridge: ${connection.endpoint}`);
  if (connection.token) lines.push(`Token: ${connection.token}`);
  return lines.join('\n');
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
        `The sheet bridge answered with HTTP ${response.status}. Check that the web app is deployed with access set to “Anyone”.`,
      );
    }
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The sheet bridge did not reply in time. Check your connection and try again.');
    }
    if (error instanceof TypeError) {
      throw new Error(
        'Could not reach the Apps Script bridge. Make sure the deployment is set to “Anyone”, the URL ends in /exec, and any ad blocker is disabled for this page.',
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
      'The sheet bridge returned a web page instead of data. Open the /exec URL in a new tab: if it asks you to sign in or authorize, redeploy with access set to “Anyone”.',
    );
  }

  if (payload.ok === false && !payload.conflict) {
    const message = typeof payload.error === 'string' ? payload.error : '';
    if (message === 'unauthorized') {
      throw new Error('The access token does not match the TOKEN in the sheet script.');
    }
    throw new Error(message || 'The sheet bridge rejected the request.');
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
    deviceId: typeof state.deviceId === 'string' ? state.deviceId : undefined,
    settings: parseStoredSettings(JSON.stringify(state.settings ?? {})),
    progress: parseStoredProgress(JSON.stringify(state.progress ?? null)),
  };
}

export async function readSheet(connection: SheetConnection): Promise<SheetReadResult> {
  const url = new URL(connection.endpoint);
  url.searchParams.set('action', 'read');
  if (connection.token) url.searchParams.set('token', connection.token);
  url.searchParams.set('_', String(Date.now()));

  const payload = await callBridge(url.toString());
  const snapshot = snapshotFromPayload(payload, connection.sheetUrl);
  if (!snapshot) {
    throw new Error('The sheet bridge replied without any Wordloom data.');
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

  if (response.conflict) {
    const snapshot = snapshotFromPayload(response, connection.sheetUrl);
    if (!snapshot) {
      throw new Error('The sheet changed on another device, but its data could not be read.');
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
