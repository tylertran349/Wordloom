/**
 * Deployment-wide Google Sheets configuration.
 *
 * A learner's progress lives in a spreadsheet they own, shared with the owner
 * address inside src/lib/wordloom-sheets.gs so the anonymous data bridge can
 * open it. The connect page (a second deployment of the same Apps Script,
 * executed as the visiting user) handles sign-in and sheet selection.
 *
 * Override any of these at build time with Vite environment variables, for
 * example VITE_WORDLOOM_BRIDGE_URL=https://script.google.com/macros/s/.../exec
 */

const DEFAULT_BRIDGE_URL =
  'https://script.google.com/macros/s/AKfycbw_We-Etpaz0G_dO1QF75ES1Cot95kZ57w9RcPVQqCEYvkKCMK-fN-TW22JmL_-d8Pb/exec';
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/18sPZDwPeFFFpPFtjOI8UddACO8ilg5jJBDoozQ7Iek4/edit';

/**
 * The connect page URL, ending in /exec. See src/lib/wordloom-sheets.gs for the
 * Apps Script that serves it.
 */
const DEFAULT_CONNECT_URL = 'https://script.google.com/macros/s/AKfycbxmJO5LOekt_MIbuuJ1UVxtnWyulEYTPfAnTwo5B2VmfgfNbryrWOjABVskeUNxApkP/exec';

const env = import.meta.env;

/** Shared Apps Script web app URL for data, ending in /exec. */
export const SHARED_SHEET_ENDPOINT = (env.VITE_WORDLOOM_BRIDGE_URL ?? DEFAULT_BRIDGE_URL).trim();

/** Human-facing legacy spreadsheet URL. Only the owner can actually open it. */
export const SHARED_SHEET_URL = (env.VITE_WORDLOOM_SHEET_URL ?? DEFAULT_SHEET_URL).trim();

/** Apps Script web app URL for the Google sign-in / sheet picker page. */
export const SHARED_CONNECT_ENDPOINT = (env.VITE_WORDLOOM_CONNECT_URL ?? DEFAULT_CONNECT_URL).trim();

/** Optional token shared by the bridge and the site. Blank is the default. */
export const SHARED_SYNC_TOKEN = (env.VITE_WORDLOOM_SYNC_TOKEN ?? '').trim();
