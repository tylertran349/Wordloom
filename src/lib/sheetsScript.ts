import bridgeSource from './wordloom-sheets.gs?raw';
import {
  BRIDGE_OWNER_EMAIL,
  CONNECT_ALLOWED_ORIGINS,
  LEGACY_OWNER_EMAIL,
} from './site';

/**
 * The Google Apps Script that turns a spreadsheet into a Wordloom database.
 *
 * One script serves two web-app deployments:
 *
 *   - the data bridge (execute as the owner, anonymous) that reads and writes
 *     a learner's spreadsheet by id;
 *   - the connect page (execute as the visiting user) that signs a learner in,
 *     lets them pick or create a sheet, and shares it with the owner.
 *
 * The source lives in ./wordloom-sheets.gs so it stays valid JavaScript, and it
 * is exported as a plain string so Settings can show, copy, and download it.
 * Deployment values are substituted for placeholders at build time.
 */
export const WORDLOOM_BRIDGE_FILENAME = 'wordloom-sheets.gs';

function fillTemplate(source: string): string {
  return source
    .replace('__LEGACY_OWNER_EMAIL__', JSON.stringify(LEGACY_OWNER_EMAIL))
    .replace('__BRIDGE_OWNER_EMAIL__', JSON.stringify(BRIDGE_OWNER_EMAIL))
    .replace('__CONNECT_ORIGINS__', JSON.stringify(CONNECT_ALLOWED_ORIGINS, null, 2));
}

export const WORDLOOM_BRIDGE_SOURCE = fillTemplate(bridgeSource);
