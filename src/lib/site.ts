/**
 * Deployment-wide Google Sheets configuration.
 *
 * The data bridge belongs to the site owner. A learner's progress now lives in
 * a spreadsheet they own, shared with BRIDGE_OWNER_EMAIL so the anonymous data
 * bridge can open it. The connect page (a second deployment of the same Apps
 * Script, executed as the visiting user) handles sign-in and sheet selection.
 *
 * Override any of these at build time with Vite environment variables, for
 * example VITE_WORDLOOM_BRIDGE_URL=https://script.google.com/macros/s/.../exec
 */

const DEFAULT_BRIDGE_URL =
  'https://script.google.com/macros/s/AKfycbw_We-Etpaz0G_dO1QF75ES1Cot95kZ57w9RcPVQqCEYvkKCMK-fN-TW22JmL_-d8Pb/exec';
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/18sPZDwPeFFFpPFtjOI8UddACO8ilg5jJBDoozQ7Iek4/edit';

/**
 * The connect page URL, ending in /exec. Leave blank until the second web-app
 * deployment exists; Settings explains how to create it.
 */
const DEFAULT_CONNECT_URL = '';
const DEFAULT_LEGACY_OWNER_EMAIL = 'tylertran349@gmail.com';

const env = import.meta.env;

/** Shared Apps Script web app URL for data, ending in /exec. */
export const SHARED_SHEET_ENDPOINT = (env.VITE_WORDLOOM_BRIDGE_URL ?? DEFAULT_BRIDGE_URL).trim();

/** Human-facing legacy spreadsheet URL. Only the owner can actually open it. */
export const SHARED_SHEET_URL = (env.VITE_WORDLOOM_SHEET_URL ?? DEFAULT_SHEET_URL).trim();

/** Apps Script web app URL for the Google sign-in / sheet picker page. */
export const SHARED_CONNECT_ENDPOINT = (env.VITE_WORDLOOM_CONNECT_URL ?? DEFAULT_CONNECT_URL).trim();

/** Optional token shared by the bridge and the site. Blank is the default. */
export const SHARED_SYNC_TOKEN = (env.VITE_WORDLOOM_SYNC_TOKEN ?? '').trim();

/**
 * The Google account that owns the data bridge. Every learner's sheet is
 * shared with this address so the anonymous bridge can read and write it.
 */
export const BRIDGE_OWNER_EMAIL = (
  env.VITE_WORDLOOM_OWNER_EMAIL ?? DEFAULT_LEGACY_OWNER_EMAIL
)
  .trim()
  .toLowerCase();

/**
 * Existing single-user data in the legacy sheet is adopted by this email during
 * the one-time schema migration. Keep this in sync with LEGACY_OWNER_EMAIL in
 * the bridge script (sheetsScript.ts imports this value).
 */
export const LEGACY_OWNER_EMAIL = (
  env.VITE_WORDLOOM_LEGACY_OWNER_EMAIL ?? DEFAULT_LEGACY_OWNER_EMAIL
)
  .trim()
  .toLowerCase();

/**
 * Origins the connect page may redirect back to. Keep this list in sync with
 * wherever the built site is served.
 */
export const CONNECT_ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      'https://tylertran349.github.io',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      ...(env.VITE_WORDLOOM_ALLOWED_ORIGINS
        ? String(env.VITE_WORDLOOM_ALLOWED_ORIGINS).split(',')
        : []),
    ]
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
);
