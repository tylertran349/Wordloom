/**
 * Deployment-wide Google Sheets configuration.
 *
 * The sheet belongs to the site owner, not to each visitor. The Apps Script
 * bridge identifies a learner by the email they enter in Settings, so the same
 * deployment URL is safe to ship with the static build.
 *
 * Override any of these at build time with Vite environment variables, for
 * example VITE_WORDLOOM_BRIDGE_URL=https://script.google.com/macros/s/.../exec
 */

const DEFAULT_BRIDGE_URL =
  'https://script.google.com/macros/s/AKfycbw_We-Etpaz0G_dO1QF75ES1Cot95kZ57w9RcPVQqCEYvkKCMK-fN-TW22JmL_-d8Pb/exec';
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/18sPZDwPeFFFpPFtjOI8UddACO8ilg5jJBDoozQ7Iek4/edit';
const DEFAULT_LEGACY_OWNER_EMAIL = 'tylertran349@gmail.com';

const env = import.meta.env;

/** Shared Apps Script web app URL, ending in /exec. */
export const SHARED_SHEET_ENDPOINT = (env.VITE_WORDLOOM_BRIDGE_URL ?? DEFAULT_BRIDGE_URL).trim();

/** Human-facing spreadsheet URL. Only the owner can actually open it. */
export const SHARED_SHEET_URL = (env.VITE_WORDLOOM_SHEET_URL ?? DEFAULT_SHEET_URL).trim();

/** Optional token shared by the bridge and the site. Blank is the default. */
export const SHARED_SYNC_TOKEN = (env.VITE_WORDLOOM_SYNC_TOKEN ?? '').trim();

/**
 * Existing single-user data in the sheet is adopted by this email during the
 * one-time schema migration. Keep this in sync with LEGACY_OWNER_EMAIL in the
 * bridge script (sheetsScript.ts imports this value).
 */
export const LEGACY_OWNER_EMAIL = (
  env.VITE_WORDLOOM_LEGACY_OWNER_EMAIL ?? DEFAULT_LEGACY_OWNER_EMAIL
)
  .trim()
  .toLowerCase();
