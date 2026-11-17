/**
 * Wordloom Google Sheets bridge
 *
 * One script, two web-app deployments:
 *
 *   1. Data bridge
 *      Deploy > New deployment > Web app
 *      Execute as: Me
 *      Who has access: Anyone
 *      This is the URL the site uses for every read and write.
 *
 *   2. Connect page
 *      Deploy > New deployment > Web app
 *      Execute as: User accessing the web app
 *      Who has access: Anyone with a Google account
 *      This page signs a learner in, lets them pick or create a sheet, and
 *      shares that sheet with BRIDGE_OWNER_EMAIL so the data bridge can use it.
 *
 * A sheet request carries sheetId + secret. The secret lives in the sheet's
 * "Wordloom Meta" tab and is checked before any data is read or written, so a
 * leaked spreadsheet id alone is not enough to read or change progress.
 *
 * Requests without a sheetId use the bound spreadsheet and the typed email:
 * that is the legacy shared-sheet mode, kept for importing old progress.
 *
 * Schema 5 keeps the per-email row layout from schema 4.
 *
 * This file is pasted into the Apps Script editor as-is. Change the owner
 * email and allowed origins below if the deployment moves.
 */

var SCHEMA = 5;

// Optional shared password for the legacy (email) mode. Blank by default.
var TOKEN = '';

// Rows from before the per-email migration belong to this address.
var LEGACY_OWNER_EMAIL = 'tylertran349@gmail.com';

// User sheets are shared with this account so the anonymous data bridge can
// open them. It must be the Google account that deployed the data bridge.
var BRIDGE_OWNER_EMAIL = 'tylertran349@gmail.com';

// Only these site origins may receive the connection redirect.
var CONNECT_ORIGINS = [
  'https://tylertran349.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
];

var GLOBAL_EMAIL = '';

var TABS = {
  meta: 'Wordloom Meta',
  settings: 'Wordloom Settings',
  cards: 'Wordloom Cards',
  responses: 'Wordloom Responses',
  solutions: 'Wordloom Solutions',
  examples: 'Wordloom Examples',
  practice: 'Wordloom Practice',
  activity: 'Wordloom Activity',
  history: 'Wordloom Review Log',
  users: 'Wordloom Users'
};

var HEADERS = {
  meta: ['email', 'key', 'value'],
  settings: ['email', 'key', 'value'],
  cards: ['email', 'wordId', 'ease', 'interval', 'repetitions', 'lapses', 'due', 'createdAt', 'lastReviewed', 'totalReviews', 'status'],
  responses: ['email', 'key', 'value'],
  solutions: ['email', 'key', 'value'],
  examples: ['email', 'wordId', 'target', 'native'],
  practice: ['email', 'wordId', 'sentence'],
  activity: ['email', 'date', 'studied', 'reviews'],
  history: ['email', 'wordId', 'grade', 'at', 'interval'],
  users: ['email', 'firstSeen', 'lastSeen', 'lastDevice', 'cards', 'reviews']
};

// ---------------------------------------------------------------------------
// Web app entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};

    if (String(params.page || '') === 'connect') return connectPage_(e);

    if (!allowed_(params.token)) return replyError_(bridgeError_('unauthorized', 'unauthorized'));

    var target = resolveRequest_(params);

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (lockError) {
      return reply_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
    }

    try {
      ensureMigrated_(target.sheet, target.email, target.sheetMode);
      return reply_({
        ok: true,
        schema: SCHEMA,
        mode: target.sheetMode ? 'sheet' : 'legacy',
        sheetUrl: target.sheet.getUrl(),
        state: readState_(target.sheet, target.email)
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return replyError_(error);
  }
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else {
      body = (e && e.parameter) || {};
    }
  } catch (error) {
    return reply_({ ok: false, error: 'The request body was not valid JSON.' });
  }

  if (!allowed_(body.token)) return replyError_(bridgeError_('unauthorized', 'unauthorized'));
  if (body.action !== 'write') return reply_({ ok: false, error: 'Unknown action.' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (error) {
    return reply_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
  }

  try {
    var target = resolveRequest_(body);
    ensureMigrated_(target.sheet, target.email, target.sheetMode);

    var current = number_(readUserMeta_(target.sheet, target.email).updatedAt);
    var base = number_(body.baseUpdatedAt);
    // A base of 0 means "the app chose to overwrite"; only guard against a
    // revision that changed after the app last read it.
    if (base > 0 && current > base) {
      return reply_({
        ok: false,
        conflict: true,
        schema: SCHEMA,
        sheetUrl: target.sheet.getUrl(),
        state: readState_(target.sheet, target.email)
      });
    }

    var updatedAt = writeState_(target.sheet, target.email, body);
    return reply_({
      ok: true,
      schema: SCHEMA,
      updatedAt: updatedAt,
      sheetUrl: target.sheet.getUrl()
    });
  } catch (error) {
    return replyError_(error);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Resolve the spreadsheet a request is about.
 *
 * - With sheetId: open it by id, verify the per-sheet secret, and read the
 *   account email from the sheet itself. Requires edit access for writes.
 * - Without sheetId: the legacy bound sheet, keyed by the request email.
 */
function resolveRequest_(input) {
  var sheetId = String((input && input.sheetId) || '').trim();

  if (!sheetId) {
    var bound = SpreadsheetApp.getActiveSpreadsheet();
    if (!bound) {
      throw bridgeError_('no-sheet', 'This deployment is not attached to a spreadsheet.');
    }
    var legacyEmail = normalizeEmail_(input && input.email);
    if (!legacyEmail) {
      throw bridgeError_(
        'no-email',
        'An email address is required to use the shared Wordloom sheet.'
      );
    }
    return { sheet: bound, email: legacyEmail, sheetMode: false };
  }

  if (!isSheetId_(sheetId)) {
    throw bridgeError_('no-access', 'That spreadsheet id is not valid.');
  }

  var sheet;
  try {
    sheet = SpreadsheetApp.openById(sheetId);
  } catch (openError) {
    throw bridgeError_(
      'no-access',
      'Wordloom could not open that spreadsheet. Check that it is still shared with the owner.'
    );
  }

  var meta = readGlobalMeta_(sheet);
  if (!meta.token) {
    throw bridgeError_('not-connected', 'This spreadsheet has not been connected to Wordloom.');
  }
  if (String(meta.token) !== String((input && input.secret) || '')) {
    throw bridgeError_('unauthorized', 'This spreadsheet secret is not valid.');
  }

  var email = normalizeEmail_(meta.email || (input && input.email));
  if (!email) {
    throw bridgeError_('not-connected', 'This spreadsheet has no Wordloom account yet.');
  }

  if (input && input.action === 'write') {
    var access;
    try {
      access = DriveApp.getFileById(sheetId).getAccess(Session.getEffectiveUser());
    } catch (accessError) {
      access = DriveApp.Permission.NONE;
    }
    if (!canEdit_(access)) {
      throw bridgeError_(
        'no-access',
        'Wordloom only has read access to this spreadsheet. Share it again with edit access.'
      );
    }
  }

  return { sheet: sheet, email: email, sheetMode: true };
}

// ---------------------------------------------------------------------------
// Connect page (second deployment, executes as the visiting user)
// ---------------------------------------------------------------------------

function connectPage_(e) {
  var active = activeEmail_();
  var effective = effectiveEmail_();

  // On the data deployment the script executes as the owner, so a visitor can
  // never reach this page through the public data URL.
  if (!active || active !== effective) {
    return reply_({ ok: false, error: 'Open this page from Wordloom Settings.' });
  }

  var returnUrl = safeReturnUrl_((e && e.parameter && e.parameter.return) || '');
  var nonce = String((e && e.parameter && e.parameter.nonce) || '').trim();
  return HtmlService.createHtmlOutput(connectHtml_(returnUrl, nonce)).setTitle(
    'Wordloom - Connect Google Sheets'
  );
}

/** Everything the connect page needs to draw itself. */
function connectContext() {
  try {
    var email = verifiedEmail_();
    if (!email) {
      return { ok: false, error: 'Google did not return an email address for this account.' };
    }
    if (!BRIDGE_OWNER_EMAIL) {
      return { ok: false, error: 'The site owner has not finished the Google Sheets setup.' };
    }

    var authorized = true;
    var authUrl = '';
    try {
      var info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
      if (info.getAuthorizationStatus() !== ScriptApp.AuthorizationStatus.NOT_REQUIRED) {
        authorized = false;
        authUrl = info.getAuthorizationUrl() || '';
      }
    } catch (authError) {
      authorized = true;
    }

    var saved = readSavedConnection_();
    var sheets = [];
    if (authorized) {
      try {
        sheets = listSheets_();
      } catch (listError) {
        // Most often the Drive scope was declined. Ask for it again.
        authorized = false;
        try {
          authUrl =
            ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationUrl() || '';
        } catch (authAgain) {
          authUrl = '';
        }
      }
    }

    return {
      ok: true,
      email: email,
      owner: BRIDGE_OWNER_EMAIL,
      authorized: authorized,
      authUrl: authUrl,
      saved: saved
        ? { sheetId: saved.sheetId, sheetUrl: saved.sheetUrl, name: saved.name }
        : null,
      sheets: sheets
    };
  } catch (error) {
    return { ok: false, error: errorText_(error) };
  }
}

/**
 * Bind a spreadsheet to the signed-in Google account and share it with the
 * site owner. Reuses the sheet's existing secret so other devices stay valid.
 */
function bindSheet(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (lockError) {
    return { ok: false, error: 'Google is busy. Try again in a moment.' };
  }

  try {
    var email = verifiedEmail_();
    if (!email) {
      return { ok: false, error: 'Google did not return an email address for this account.' };
    }
    if (!BRIDGE_OWNER_EMAIL) {
      return { ok: false, error: 'The site owner has not finished the Google Sheets setup.' };
    }

    var mode = payload && payload.mode === 'new' ? 'new' : 'existing';
    var sheet;

    if (mode === 'new') {
      var name = String((payload && payload.name) || '').trim().slice(0, 80);
      sheet = SpreadsheetApp.create(name || 'Wordloom');
    } else {
      var sheetId = String((payload && payload.sheetId) || '').trim();
      if (!isSheetId_(sheetId)) {
        return { ok: false, error: 'Choose a spreadsheet first.' };
      }
      try {
        sheet = SpreadsheetApp.openById(sheetId);
      } catch (openError) {
        return {
          ok: false,
          error: 'Wordloom cannot open that spreadsheet. Choose one you can edit.'
        };
      }
    }

    var file = DriveApp.getFileById(sheet.getId());
    var access = file.getAccess(Session.getActiveUser());
    if (mode === 'existing' && !canEdit_(access)) {
      return { ok: false, error: 'You need edit access to that spreadsheet.' };
    }

    // Adopt an older single-user sheet before reading its meta tab, otherwise
    // the old key/value rows would be mistaken for account rows.
    ensureMigrated_(sheet, email, true);

    var accounts = listAccounts_(sheet);
    var mine = hasAccount_(accounts, email);
    var adopt = normalizeEmail_((payload && payload.adoptEmail) || '');

    if (adopt && adopt !== email) {
      if (!hasAccount_(accounts, adopt)) {
        return { ok: false, error: 'That account is not in this spreadsheet.' };
      }
      if (mine) {
        return {
          ok: false,
          error: 'This Google account already has progress in that spreadsheet.'
        };
      }
      moveAccount_(sheet, adopt, email);
      accounts = listAccounts_(sheet);
      mine = hasAccount_(accounts, email);
    }

    // Never quietly create a second account inside someone else's workbook.
    // Existing data must be explicitly moved first.
    if (!mine && accounts.length > 0) {
      return {
        ok: false,
        code: 'needs-adopt',
        error:
          'That spreadsheet already contains Wordloom data for another account. Move that progress to your Google account, or choose a different sheet.',
        accounts: accounts
      };
    }

    var meta = readGlobalMeta_(sheet);
    var previousEmail = normalizeEmail_(meta.email || '');
    var secret = String(meta.token || '');
    // Keep existing devices connected, unless this sheet is being handed to a
    // different account. Then the old secret must stop working.
    if (!secret || (previousEmail && previousEmail !== email)) {
      secret = randomSecret_();
    }

    var existing = ensureMetaTab_(sheet);
    writeGlobalMeta_(sheet, email, secret);

    var ownerEmail = normalizeEmail_(BRIDGE_OWNER_EMAIL);

    if (ownerEmail && ownerEmail !== email) {
      try {
        file.addEditor(ownerEmail);
      } catch (shareError) {
        return {
          ok: false,
          error:
            'Google would not share this spreadsheet with the site owner. Your organization may block external sharing. Try a sheet in a personal Google account, or create a new one.'
        };
      }
    }

    saveConnection_(email, {
      sheetId: sheet.getId(),
      sheetUrl: sheet.getUrl(),
      name: file.getName(),
      secret: secret,
      connectedAt: Date.now()
    });

    return {
      ok: true,
      email: email,
      sheetId: sheet.getId(),
      sheetUrl: sheet.getUrl(),
      name: file.getName(),
      secret: secret,
      owner: ownerEmail,
      reusedSheet: Boolean(existing),
      adopted: Boolean(adopt && adopt !== email),
      adoptedFrom: adopt || ''
    };
  } catch (error) {
    return { ok: false, error: errorText_(error) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Describe a spreadsheet before connecting it, so the page can ask before any
 * row is moved. Writing happens only in bindSheet.
 */
function previewSheet(sheetId) {
  try {
    var email = verifiedEmail_();
    if (!email) {
      return { ok: false, error: 'Google did not return an email address for this account.' };
    }
    var id = String(sheetId || '').trim();
    if (!isSheetId_(id)) {
      return { ok: false, error: 'Choose a spreadsheet first.' };
    }

    var sheet;
    try {
      sheet = SpreadsheetApp.openById(id);
    } catch (openError) {
      return { ok: false, error: 'Wordloom cannot open that spreadsheet. Choose one you can edit.' };
    }

    var file = DriveApp.getFileById(id);
    var access = file.getAccess(Session.getActiveUser());
    if (!canEdit_(access)) {
      return { ok: false, error: 'You need edit access to that spreadsheet.' };
    }

    var metaTab = sheet.getSheetByName(TABS.meta);
    var cardsTab = sheet.getSheetByName(TABS.cards);
    var existing = Boolean(metaTab || cardsTab);

    if (!existing) {
      return {
        ok: true,
        sheetId: id,
        name: file.getName(),
        existing: false,
        legacy: false,
        mine: false,
        verifiedEmail: email,
        accounts: []
      };
    }

    var header = String(
      metaTab ? metaTab.getRange(1, 1, 1, 1).getValue() || '' : ''
    ).trim().toLowerCase();

    // Schema 3 has no email column. bindSheet migrates those rows to the
    // signed-in account, so there is nothing to choose here.
    if (header && header !== 'email') {
      return {
        ok: true,
        sheetId: id,
        name: file.getName(),
        existing: true,
        legacy: true,
        mine: false,
        verifiedEmail: email,
        accounts: []
      };
    }

    var accounts = listAccounts_(sheet);
    return {
      ok: true,
      sheetId: id,
      name: file.getName(),
      existing: true,
      legacy: false,
      mine: hasAccount_(accounts, email),
      verifiedEmail: email,
      accounts: accounts
    };
  } catch (error) {
    return { ok: false, error: errorText_(error) };
  }
}

/** Every account that already has rows in a sheet, with a card count. */
function listAccounts_(sheet) {
  var counts = {};
  var order = [];

  function note(email) {
    var clean = normalizeEmail_(email);
    if (!clean) return '';
    if (!Object.prototype.hasOwnProperty.call(counts, clean)) {
      counts[clean] = 0;
      order.push(clean);
    }
    return clean;
  }

  eachRow_(sheet, TABS.meta, function (row) {
    if (!row[1]) return;
    note(rowEmail_(row));
  });

  eachRow_(sheet, TABS.cards, function (row) {
    if (!row[1]) return;
    var clean = note(rowEmail_(row));
    if (clean) counts[clean] += 1;
  });

  var accounts = order.map(function (email) {
    return { email: email, cards: counts[email] || 0 };
  });
  accounts.sort(function (a, b) {
    return b.cards - a.cards;
  });
  return accounts;
}

function hasAccount_(accounts, email) {
  var clean = normalizeEmail_(email);
  if (!clean) return false;
  for (var i = 0; i < accounts.length; i += 1) {
    if (accounts[i].email === clean) return true;
  }
  return false;
}

/** Re-key every row from one account email to another, in place. */
function moveAccount_(sheet, fromEmail, toEmail) {
  var from = normalizeEmail_(fromEmail);
  var to = normalizeEmail_(toEmail);
  if (!from || !to || from === to) return 0;

  var order = ['meta', 'settings', 'cards', 'responses', 'solutions', 'examples', 'practice', 'activity', 'history'];
  var moved = 0;

  for (var i = 0; i < order.length; i += 1) {
    var key = order[i];
    var tab = sheet.getSheetByName(TABS[key]);
    if (!tab) continue;

    var width = HEADERS[key].length;
    ensureWidth_(tab, width);
    var lastRow = tab.getLastRow();
    if (lastRow < 2) continue;

    var values = tab.getRange(2, 1, lastRow - 1, width).getValues();
    var rows = [];
    for (var r = 0; r < values.length; r += 1) {
      if (rowEmail_(values[r]) === from) {
        values[r][0] = to;
        if (key === 'cards') moved += 1;
      }
      rows.push(padRow_(values[r], width));
    }
    writeAllTable_(sheet, TABS[key], HEADERS[key], rows);
  }

  var users = sheet.getSheetByName(TABS.users);
  if (users) {
    var userWidth = HEADERS.users.length;
    ensureWidth_(users, userWidth);
    var lastUserRow = users.getLastRow();
    var userValues =
      lastUserRow >= 2 ? users.getRange(2, 1, lastUserRow - 1, userWidth).getValues() : [];
    var userRows = [];
    var movedRow = null;
    var seen = {};

    for (var u = 0; u < userValues.length; u += 1) {
      var owner = normalizeEmail_(rowEmail_(userValues[u]));
      if (owner === from) {
        movedRow = padRow_(userValues[u], userWidth);
        movedRow[0] = to;
        continue;
      }
      if (owner && seen[owner]) continue;
      if (owner) seen[owner] = true;
      userRows.push(padRow_(userValues[u], userWidth));
    }

    if (movedRow && !seen[to]) userRows.push(movedRow);
    writeAllTable_(sheet, TABS.users, HEADERS.users, userRows);
  }

  return moved;
}

function listSheets_() {
  var results = [];
  var files = DriveApp.searchFiles(
    "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
  );
  var count = 0;
  while (files.hasNext() && count < 200) {
    var file = files.next();
    count += 1;
    results.push({
      id: file.getId(),
      name: file.getName(),
      url: file.getUrl(),
      updated: file.getLastUpdated().getTime()
    });
  }

  results.sort(function (a, b) {
    return b.updated - a.updated;
  });
  return results;
}

function ensureMetaTab_(sheet) {
  if (sheet.getSheetByName(TABS.meta)) return true;
  var sheets = sheet.getSheets();
  if (sheets.length === 1) {
    var only = sheets[0];
    if (only.getLastRow() === 0 && only.getName() === 'Sheet1') {
      only.setName(TABS.meta);
      return true;
    }
  }
  return false;
}

function writeGlobalMeta_(sheet, email, secret) {
  var metaSheet = sheet.getSheetByName(TABS.meta) || sheet.insertSheet(TABS.meta);
  ensureWidth_(metaSheet, HEADERS.meta.length);

  var lastRow = metaSheet.getLastRow();
  var values =
    lastRow >= 2
      ? metaSheet.getRange(2, 1, lastRow - 1, HEADERS.meta.length).getValues()
      : [];

  var global = {};
  var others = [];
  for (var i = 0; i < values.length; i += 1) {
    if (rowEmail_(values[i]) === GLOBAL_EMAIL) {
      if (values[i][1]) global[String(values[i][1])] = values[i][2];
    } else {
      others.push(values[i]);
    }
  }

  global.schema = SCHEMA;
  global.email = email;
  global.token = secret;

  var rows = [];
  Object.keys(global).forEach(function (key) {
    rows.push([GLOBAL_EMAIL, key, global[key]]);
  });
  for (var j = 0; j < others.length; j += 1) {
    rows.push(padRow_(others[j], HEADERS.meta.length));
  }

  writeAllTable_(sheet, TABS.meta, HEADERS.meta, rows);
}

function readGlobalMeta_(sheet) {
  var result = {};
  eachRow_(sheet, TABS.meta, function (row) {
    if (rowEmail_(row) !== GLOBAL_EMAIL) return;
    if (!row[1]) return;
    result[String(row[1])] = row[2];
  });
  return result;
}

function readSavedConnection_() {
  try {
    var raw = PropertiesService.getUserProperties().getProperty('wordloom.connection');
    if (!raw) return null;
    var value = JSON.parse(raw);
    if (!value || !value.sheetId) return null;
    return value;
  } catch (error) {
    return null;
  }
}

function saveConnection_(email, connection) {
  try {
    PropertiesService.getUserProperties().setProperty(
      'wordloom.connection',
      JSON.stringify({
        email: email,
        sheetId: connection.sheetId,
        sheetUrl: connection.sheetUrl,
        name: connection.name,
        secret: connection.secret,
        connectedAt: connection.connectedAt
      })
    );
  } catch (error) {
    // The connection still works for this request if properties are full.
  }
}

function safeReturnUrl_(value) {
  var url = String(value || '').trim();
  if (!url) return '';
  for (var i = 0; i < CONNECT_ORIGINS.length; i += 1) {
    var origin = String(CONNECT_ORIGINS[i] || '').replace(/\/+$/, '');
    if (!origin) continue;
    if (url === origin || url.indexOf(origin + '/') === 0) return url;
  }
  return '';
}

function randomSecret_() {
  try {
    return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  } catch (error) {
    return 's' + String(Date.now()) + String(Math.random()).slice(2, 12);
  }
}

function activeEmail_() {
  try {
    return normalizeEmail_(Session.getActiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function effectiveEmail_() {
  try {
    return normalizeEmail_(Session.getEffectiveUser().getEmail());
  } catch (error) {
    return '';
  }
}

function verifiedEmail_() {
  var email = activeEmail_();
  if (!email) return '';
  return normalizeEmail_(email);
}

function connectHtml_(returnUrl, nonce) {
  var values = {
    returnUrl: returnUrl,
    nonce: String(nonce || ''),
    owner: BRIDGE_OWNER_EMAIL
  };

  var lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<base target="_top">',
    '<title>Wordloom - Connect Google Sheets</title>',
    '<style>',
    ':root { color-scheme: light; }',
    '* { box-sizing: border-box; }',
    'body { margin: 0; padding: 28px 20px 40px; background: #f6f4ef; color: #1d2620; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }',
    'main { max-width: 520px; margin: 0 auto; }',
    'header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }',
    '.mark { width: 40px; height: 40px; border-radius: 12px; background: #1f6f52; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 20px; }',
    'h1 { font-size: 22px; margin: 0; }',
    'h2 { font-size: 18px; margin: 0 0 6px; }',
    'p { margin: 0 0 10px; line-height: 1.5; }',
    '.card { background: #fff; border: 1px solid #e3ded3; border-radius: 16px; padding: 20px; box-shadow: 0 1px 2px rgba(20, 30, 24, .04); }',
    '.subtle { color: #5c665f; font-size: 14px; }',
    '.account { font-size: 14px; color: #5c665f; margin-bottom: 18px; }',
    '.account strong { color: #1d2620; }',
    'button, .button { width: 100%; border: 1px solid transparent; border-radius: 10px; padding: 11px 14px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }',
    'button:disabled { opacity: .55; cursor: default; }',
    '.primary { background: #1f6f52; color: #fff; }',
    '.primary:hover:not(:disabled) { background: #195a43; }',
    '.secondary { background: #f1eee6; color: #1d2620; border-color: #e3ded3; }',
    '.secondary:hover:not(:disabled) { background: #e8e4d9; }',
    'a.button { display: block; text-align: center; text-decoration: none; }',
    '.row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: #fff; border: 1px solid #e3ded3; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; text-align: left; width: 100%; font-weight: 500; cursor: pointer; }',
    '.row:hover { border-color: #c9d7cf; background: #fbfaf6; }',
    '.row span { color: #5c665f; font-size: 12px; font-weight: 500; }',
    '.saved { background: #eef6f1; border: 1px solid #cfe4d8; border-radius: 14px; padding: 16px; margin-bottom: 18px; }',
    '.saved p { margin-bottom: 12px; }',
    '.choice { display: flex; align-items: center; gap: 8px; padding: 7px 0; font-size: 14px; }',
    '.choice input { width: auto; }',
    '.divider { display: flex; align-items: center; gap: 10px; color: #8a938c; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin: 18px 0 12px; }',
    '.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: #e3ded3; }',
    '#list { max-height: 300px; overflow-y: auto; margin-bottom: 14px; }',
    '.new { display: block; margin: 18px 0 10px; }',
    '.new span { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }',
    'input { width: 100%; border: 1px solid #d8d2c6; border-radius: 10px; padding: 10px 12px; font-size: 15px; font-family: inherit; background: #fff; }',
    'input:focus { outline: 2px solid #bcd8ca; border-color: #1f6f52; }',
    '.fine { font-size: 12px; color: #6b746d; margin-top: 14px; }',
    '.error { background: #fdf1ef; border: 1px solid #f2cfc8; color: #8a2f20; border-radius: 12px; padding: 12px 14px; margin-top: 14px; }',
    '.ok { background: #eef6f1; border: 1px solid #cfe4d8; border-radius: 14px; padding: 18px; }',
    '.hidden { display: none !important; }',
    '.spin { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: -2px; margin-right: 8px; }',
    '@keyframes spin { to { transform: rotate(360deg); } }',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<header><span class="mark">W</span><div><h1>Wordloom</h1><p class="subtle">Connect a Google Sheet</p></div></header>',
    '<section id="loading" class="card"><p class="subtle">Checking your Google account...</p></section>',
    '<section id="fatal" class="card hidden">',
    '  <h2>Could not connect</h2>',
    '  <p id="fatal-text"></p>',
    '  <p class="subtle">Close this tab and try again from Wordloom Settings.</p>',
    '</section>',
    '<section id="setup" class="card hidden">',
    '  <p class="account">Signed in as <strong id="email"></strong></p>',
    '  <div id="auth" class="error hidden">',
    '    <p>Wordloom needs permission to see your Google Sheets.</p>',
    '    <p><a id="auth-link" href="#" target="_top">Grant access</a></p>',
    '  </div>',
    '  <div id="saved" class="saved hidden">',
    '    <p>Use <strong id="saved-name"></strong> again?</p>',
    '    <button id="continue" class="primary" type="button">Use this sheet</button>',
    '  </div>',
    '  <div id="confirm" class="saved hidden">',
    '    <p id="confirm-text"></p>',
    '    <div id="confirm-list"></div>',
    '    <div style="height:8px"></div>',
    '    <button id="confirm-go" class="primary" type="button">Connect this sheet</button>',
    '    <div style="height:8px"></div>',
    '    <button id="confirm-cancel" class="secondary" type="button">Choose another sheet</button>',
    '  </div>',
    '  <div id="chooser">',
    '    <div class="divider">or choose a sheet</div>',
    '    <div id="list"></div>',
    '    <label class="new" for="new-name"><span>Create a new sheet</span></label>',
    '    <input id="new-name" maxlength="80" value="Wordloom" autocomplete="off">',
    '    <div style="height:10px"></div>',
    '    <button id="create" class="secondary" type="button">Create and connect</button>',
    '  </div>',
    '  <p class="fine">Wordloom can only see the spreadsheet you choose. That sheet is shared with the Wordloom owner so progress can sync in the background.</p>',
    '  <div id="error" class="error hidden"></div>',
    '</section>',
    '<section id="done" class="card hidden">',
    '  <div class="ok">',
    '    <h2>You are connected</h2>',
    '    <p><strong id="done-name"></strong> is now your Wordloom database.</p>',
    '    <p class="subtle">Progress saves to this browser first, then to your sheet.</p>',
    '  </div>',
    '  <div style="height:14px"></div>',
    '  <a id="finish" class="button primary" href="#" target="_top">Return to Wordloom</a>',
    '</section>',
    '</main>',
    '<script>',
    '(function () {',
    '  var RETURN_URL = ' + JSON.stringify(values.returnUrl) + ';',
    '  var NONCE = ' + JSON.stringify(values.nonce) + ';',
    '  var OWNER = ' + JSON.stringify(values.owner) + ';',
    '  var busy = false;',
    '  var pendingSheet = null;',
    '',
    '  function el(id) { return document.getElementById(id); }',
    '',
    '  function showSection(id) {',
    '    [ "loading", "fatal", "setup", "done" ].forEach(function (key) {',
    '      el(key).classList.toggle("hidden", key !== id);',
    '    });',
    '  }',
    '',
    '  function fatal(message) {',
    '    el("fatal-text").textContent = message || "Something went wrong.";',
    '    showSection("fatal");',
    '  }',
    '',
    '  function note(message) {',
    '    var node = el("error");',
    '    node.textContent = message;',
    '    node.classList.toggle("hidden", !message);',
    '  }',
    '',
    '  function setBusy(value) {',
    '    busy = value;',
    '    [ "continue", "create", "confirm-go", "confirm-cancel" ].forEach(function (key) { el(key).disabled = value; });',
    '    var rows = el("list").querySelectorAll("button");',
    '    for (var i = 0; i < rows.length; i += 1) rows[i].disabled = value;',
    '  }',
    '',
    '  function call(name, arg) {',
    '    return new Promise(function (resolve, reject) {',
    '      var runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);',
    '      if (arg === undefined) runner[name]();',
    '      else runner[name](arg);',
    '    });',
    '  }',
    '',
    '  function encodePayload(value) {',
    '    var bytes = new TextEncoder().encode(JSON.stringify(value));',
    '    var binary = "";',
    '    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);',
    '    return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");',
    '  }',
    '',
    '  function connectExisting(sheet) {',
    '    if (busy) return;',
    '    note("");',
    '    pendingSheet = null;',
    '    el("confirm").classList.add("hidden");',
    '    setBusy(true);',
    '    call("previewSheet", sheet.id)',
    '      .then(function (preview) {',
    '        setBusy(false);',
    '        if (!preview || !preview.ok) {',
    '          note(preview && preview.error ? preview.error : "Could not read that spreadsheet.");',
    '          return;',
    '        }',
    '        if (preview.legacy) {',
    '          el("confirm-text").textContent = "This sheet already has Wordloom tabs. They will be linked to " + preview.verifiedEmail + ". Other tabs are left alone.";',
    '          el("confirm-go").textContent = "Connect this sheet";',
    '          el("confirm-list").textContent = "";',
    '          pendingSheet = { sheetId: sheet.id, adopt: false };',
    '          el("confirm").classList.remove("hidden");',
    '          return;',
    '        }',
    '        if (!preview.mine && preview.accounts && preview.accounts.length) {',
    '          el("confirm-text").textContent = "This sheet already has Wordloom progress under another email. Choose the data to move to " + preview.verifiedEmail + ":";',
    '          el("confirm-go").textContent = "Move progress and connect";',
    '          el("confirm-list").textContent = "";',
    '          preview.accounts.forEach(function (account, index) {',
    '            var label = document.createElement("label");',
    '            label.className = "choice";',
    '            var radio = document.createElement("input");',
    '            radio.type = "radio";',
    '            radio.name = "adopt-account";',
    '            radio.value = account.email;',
    '            if (index === 0) radio.checked = true;',
    '            var text = document.createElement("span");',
    '            text.textContent = account.email + " (" + account.cards + " cards)";',
    '            label.appendChild(radio);',
    '            label.appendChild(text);',
    '            el("confirm-list").appendChild(label);',
    '          });',
    '          pendingSheet = { sheetId: sheet.id, adopt: true };',
    '          el("confirm").classList.remove("hidden");',
    '          return;',
    '        }',
    '        bindExisting(sheet.id, "");',
    '      })',
    '      .catch(function (error) {',
    '        setBusy(false);',
    '        fatal(error && error.message ? error.message : String(error));',
    '      });',
    '  }',
    '',
    '  function bindExisting(sheetId, adoptEmail) {',
    '    if (busy) return;',
    '    note("");',
    '    setBusy(true);',
    '    var payload = { mode: "existing", sheetId: sheetId };',
    '    if (adoptEmail) payload.adoptEmail = adoptEmail;',
    '    call("bindSheet", payload)',
    '      .then(finish)',
    '      .catch(function (error) { fatal(error && error.message ? error.message : String(error)); })',
    '      .then(function () { setBusy(false); });',
    '  }',
    '',
    '  function connectNew() {',
    '    if (busy) return;',
    '    note("");',
    '    var name = el("new-name").value.trim() || "Wordloom";',
    '    setBusy(true);',
    '    call("bindSheet", { mode: "new", name: name })',
    '      .then(finish)',
    '      .catch(function (error) { fatal(error && error.message ? error.message : String(error)); })',
    '      .then(function () { setBusy(false); });',
    '  }',
    '',
    '  function finish(result) {',
    '    if (!result || !result.ok) {',
    '      setBusy(false);',
    '      note(result && result.error ? result.error : "Could not connect that sheet.");',
    '      return;',
    '    }',
    '    if (!RETURN_URL) {',
    '      fatal("This page was opened without a return address. Start again from Wordloom Settings.");',
    '      return;',
    '    }',
    '    el("done-name").textContent = result.name || "Your spreadsheet";',
    '    el("finish").href = RETURN_URL + "#/settings?wl_connect=" + encodePayload({',
    '      email: result.email,',
    '      sheetId: result.sheetId,',
    '      sheetUrl: result.sheetUrl,',
    '      name: result.name,',
    '      secret: result.secret,',
    '      nonce: NONCE',
    '    });',
    '    showSection("done");',
    '  }',
    '',
    '  function render(ctx) {',
    '    if (!ctx || !ctx.ok) {',
    '      fatal(ctx && ctx.error ? ctx.error : "Could not read your Google account.");',
    '      return;',
    '    }',
    '    if (!RETURN_URL) {',
    '      fatal("This page was opened without a return address. Start again from Wordloom Settings.");',
    '      return;',
    '    }',
    '',
    '    el("email").textContent = ctx.email;',
    '',
    '    if (!ctx.authorized) {',
    '      el("auth").classList.remove("hidden");',
    '      if (ctx.authUrl) el("auth-link").href = ctx.authUrl;',
    '      else el("auth-link").classList.add("hidden");',
    '      el("chooser").classList.add("hidden");',
    '      showSection("setup");',
    '      return;',
    '    }',
    '',
    '    if (ctx.saved) {',
    '      el("saved-name").textContent = ctx.saved.name || "your spreadsheet";',
    '      el("saved").classList.remove("hidden");',
    '      el("continue").addEventListener("click", function () {',
    '        connectExisting({ id: ctx.saved.sheetId });',
    '      });',
    '    }',
    '',
    '    var list = el("list");',
    '    list.textContent = "";',
    '    (ctx.sheets || []).forEach(function (sheet) {',
    '      var button = document.createElement("button");',
    '      button.type = "button";',
    '      button.className = "row";',
    '      var name = document.createElement("strong");',
    '      name.textContent = sheet.name;',
    '      var meta = document.createElement("span");',
    '      meta.textContent = "Google Sheet";',
    '      button.appendChild(name);',
    '      button.appendChild(meta);',
    '      button.addEventListener("click", function () { connectExisting(sheet); });',
    '      list.appendChild(button);',
    '    });',
    '',
    '    el("create").addEventListener("click", connectNew);',
    '    el("confirm-go").addEventListener("click", function () {',
    '      if (!pendingSheet) return;',
    '      var adoptEmail = "";',
    '      if (pendingSheet.adopt) {',
    '        var picked = document.querySelector("input[name=adopt-account]:checked");',
    '        if (!picked) { note("Choose which progress to move."); return; }',
    '        adoptEmail = picked.value;',
    '      }',
    '      var sheetId = pendingSheet.sheetId;',
    '      pendingSheet = null;',
    '      el("confirm").classList.add("hidden");',
    '      bindExisting(sheetId, adoptEmail);',
    '    });',
    '    el("confirm-cancel").addEventListener("click", function () {',
    '      pendingSheet = null;',
    '      note("");',
    '      el("confirm").classList.add("hidden");',
    '    });',
    '    showSection("setup");',
    '  }',
    '',
    '  if (!window.google || !google.script || !google.script.run) {',
    '    fatal("This page must stay open inside Google Apps Script.");',
    '    return;',
    '  }',
    '',
    '  call("connectContext")',
    '    .then(render)',
    '    .catch(function (error) { fatal(error && error.message ? error.message : String(error)); });',
    '})();',
    '</script>',
    '</body>',
    '</html>'
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Reading and writing a learner's progress
// ---------------------------------------------------------------------------

function readState_(sheet, email) {
  var meta = readUserMeta_(sheet, email);
  var settings = readSettings_(sheet, email);

  var cards = {};
  eachRow_(sheet, TABS.cards, function (row) {
    if (rowEmail_(row) !== email) return;
    var id = String(row[1] || '');
    if (!id) return;
    cards[id] = {
      wordId: id,
      ease: number_(row[2]),
      interval: number_(row[3]),
      repetitions: number_(row[4]),
      lapses: number_(row[5]),
      due: number_(row[6]),
      createdAt: number_(row[7]),
      lastReviewed: blank_(row[8]) ? undefined : number_(row[8]),
      totalReviews: number_(row[9]),
      status: row[10] === 'review' || row[10] === 'mastered' ? String(row[10]) : 'learning'
    };
  });

  var generatedExamples = {};
  eachRow_(sheet, TABS.examples, function (row) {
    if (rowEmail_(row) !== email) return;
    var id = String(row[1] || '');
    var target = String(row[2] || '');
    if (!id || !target) return;
    if (!generatedExamples[id]) generatedExamples[id] = [];
    generatedExamples[id].push({ target: target, native: String(row[3] || '') });
  });

  var generatedPractice = {};
  eachRow_(sheet, TABS.practice, function (row) {
    if (rowEmail_(row) !== email) return;
    var id = String(row[1] || '');
    var sentence = String(row[2] || '');
    if (!id || !sentence) return;
    if (!generatedPractice[id]) generatedPractice[id] = [];
    generatedPractice[id].push(sentence);
  });

  var activity = {};
  eachRow_(sheet, TABS.activity, function (row) {
    if (rowEmail_(row) !== email) return;
    var key = String(row[1] || '');
    if (!key) return;
    activity[key] = {
      studied: number_(row[2]),
      reviews: number_(row[3])
    };
  });

  var reviewLog = [];
  eachRow_(sheet, TABS.history, function (row) {
    if (rowEmail_(row) !== email) return;
    var wordId = String(row[1] || '');
    var grade = String(row[2] || '');
    if (!wordId) return;
    if (grade !== 'again' && grade !== 'hard' && grade !== 'good' && grade !== 'easy') return;
    reviewLog.push({
      wordId: wordId,
      grade: grade,
      at: number_(row[3]),
      interval: number_(row[4])
    });
  });

  var lastStudied;
  if (meta.lastStudiedWordId) {
    lastStudied = {
      wordId: String(meta.lastStudiedWordId),
      at: number_(meta.lastStudiedAt)
    };
  }

  return {
    schema: SCHEMA,
    email: email,
    updatedAt: number_(meta.updatedAt),
    deviceId: String(meta.deviceId || ''),
    settings: settings,
    progress: {
      version: 1,
      cards: cards,
      responses: readPairs_(sheet, TABS.responses, email),
      solutions: readPairs_(sheet, TABS.solutions, email),
      generatedExamples: generatedExamples,
      generatedPractice: generatedPractice,
      activity: activity,
      reviewLog: reviewLog,
      reviewCount: number_(meta.reviewCount),
      strongReviewCount: number_(meta.strongReviewCount),
      levelPositions: readPositions_(meta),
      lastStudied: lastStudied
    }
  };
}

function writeState_(sheet, email, body) {
  var settings = body.settings || {};
  var progress = body.progress || {};
  var updatedAt = Date.now();

  writeUserTable_(
    sheet,
    TABS.settings,
    HEADERS.settings,
    email,
    Object.keys(settings).map(function (key) {
      return [email, key, JSON.stringify(settings[key])];
    })
  );

  var cards = progress.cards || {};
  writeUserTable_(
    sheet,
    TABS.cards,
    HEADERS.cards,
    email,
    Object.keys(cards).map(function (id) {
      var card = cards[id] || {};
      return [
        email,
        String(card.wordId || id),
        number_(card.ease),
        number_(card.interval),
        number_(card.repetitions),
        number_(card.lapses),
        number_(card.due),
        number_(card.createdAt),
        blank_(card.lastReviewed) ? '' : number_(card.lastReviewed),
        number_(card.totalReviews),
        String(card.status || 'learning')
      ];
    })
  );

  writeUserTable_(sheet, TABS.responses, HEADERS.responses, email, pairRows_(email, progress.responses));
  writeUserTable_(sheet, TABS.solutions, HEADERS.solutions, email, pairRows_(email, progress.solutions));

  var examples = progress.generatedExamples || {};
  var exampleRows = [];
  Object.keys(examples).forEach(function (id) {
    (examples[id] || []).forEach(function (example) {
      if (!example || !example.target) return;
      exampleRows.push([email, id, String(example.target), String(example.native || '')]);
    });
  });
  writeUserTable_(sheet, TABS.examples, HEADERS.examples, email, exampleRows);

  var practice = progress.generatedPractice || {};
  var practiceRows = [];
  Object.keys(practice).forEach(function (id) {
    (practice[id] || []).forEach(function (sentence) {
      if (!sentence) return;
      practiceRows.push([email, id, String(sentence)]);
    });
  });
  writeUserTable_(sheet, TABS.practice, HEADERS.practice, email, practiceRows);

  var activity = progress.activity || {};
  writeUserTable_(
    sheet,
    TABS.activity,
    HEADERS.activity,
    email,
    Object.keys(activity).map(function (key) {
      var day = activity[key] || {};
      return [email, key, number_(day.studied), number_(day.reviews)];
    })
  );

  writeUserTable_(
    sheet,
    TABS.history,
    HEADERS.history,
    email,
    (progress.reviewLog || []).map(function (entry) {
      return [
        email,
        String(entry.wordId || ''),
        String(entry.grade || ''),
        number_(entry.at),
        number_(entry.interval)
      ];
    })
  );

  var lastStudied = progress.lastStudied || {};
  var metaRows = [
    [email, 'updatedAt', updatedAt],
    [email, 'deviceId', String(body.deviceId || '')],
    [email, 'version', number_(progress.version) || 1],
    [email, 'reviewCount', number_(progress.reviewCount)],
    [email, 'strongReviewCount', number_(progress.strongReviewCount)],
    [email, 'lastStudiedWordId', lastStudied.wordId ? String(lastStudied.wordId) : ''],
    [email, 'lastStudiedAt', lastStudied.at ? number_(lastStudied.at) : '']
  ];
  var positions = progress.levelPositions || {};
  Object.keys(positions).forEach(function (level) {
    metaRows.push([email, 'position:' + level, number_(positions[level])]);
  });
  writeUserTable_(sheet, TABS.meta, HEADERS.meta, email, metaRows);

  upsertUser_(sheet, email, body.deviceId, Object.keys(cards).length, number_(progress.reviewCount));

  return updatedAt;
}

function readUserMeta_(sheet, email) {
  var meta = {};
  eachRow_(sheet, TABS.meta, function (row) {
    if (rowEmail_(row) !== email) return;
    if (!row[1]) return;
    meta[String(row[1])] = row[2];
  });
  return meta;
}

function readPositions_(meta) {
  var positions = {};
  Object.keys(meta).forEach(function (key) {
    if (key.indexOf('position:') !== 0) return;
    positions[key.slice(9)] = number_(meta[key]);
  });
  return positions;
}

function readPairs_(sheet, tabName, email) {
  var result = {};
  eachRow_(sheet, tabName, function (row) {
    if (rowEmail_(row) !== email) return;
    if (!row[1]) return;
    result[String(row[1])] = String(row[2] === null || row[2] === undefined ? '' : row[2]);
  });
  return result;
}

function readSettings_(sheet, email) {
  var settings = {};
  eachRow_(sheet, TABS.settings, function (row) {
    if (rowEmail_(row) !== email) return;
    if (!row[1]) return;
    var key = String(row[1]);
    var raw = row[2];
    if (raw === '' || raw === null || raw === undefined) {
      settings[key] = '';
      return;
    }
    try {
      settings[key] = JSON.parse(String(raw));
    } catch (error) {
      settings[key] = String(raw);
    }
  });
  return settings;
}

function pairRows_(email, source) {
  var map = source || {};
  return Object.keys(map).map(function (key) {
    return [email, key, String(map[key] === null || map[key] === undefined ? '' : map[key])];
  });
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

/**
 * Schema 3 stored one learner per tab. This adds the email column and assigns
 * every existing row to an owner.
 *
 * adoptRequestedEmail is true for a learner's own sheet, where old rows belong
 * to the Google account that just connected it. Legacy shared sheets keep using
 * LEGACY_OWNER_EMAIL so the original owner keeps their progress.
 */
function ensureMigrated_(sheet, requestEmail, adoptRequestedEmail) {
  var legacy = adoptRequestedEmail
    ? normalizeEmail_(requestEmail)
    : legacyEmail_(requestEmail);
  var order = ['meta', 'settings', 'cards', 'responses', 'solutions', 'examples', 'practice', 'activity', 'history'];
  var migrated = false;

  for (var i = 0; i < order.length; i += 1) {
    var key = order[i];
    var tab = sheet.getSheetByName(TABS[key]);
    if (!tab) continue;
    if (tab.getLastRow() < 1) continue;

    var header = String(tab.getRange(1, 1, 1, 1).getValue() || '').trim().toLowerCase();
    if (header === 'email') {
      // If an earlier migration was interrupted between writing the header and
      // filling the email column, restore the missing owner before continuing.
      if (key !== 'meta') repairMissingEmails_(tab, legacy);
      continue;
    }

    if (key === 'meta') {
      migrateMetaTab_(sheet, legacy);
    } else {
      var lastRow = tab.getLastRow();
      var lastColumn = Math.max(1, tab.getLastColumn());
      var values = lastRow >= 2
        ? tab.getRange(2, 1, lastRow - 1, lastColumn).getValues()
        : [];
      tab.insertColumnBefore(1);
      tab.getRange(1, 1).setValue('email').setFontWeight('bold');
      if (values.length > 0) {
        var emails = [];
        for (var r = 0; r < values.length; r += 1) emails.push([legacy]);
        tab.getRange(2, 1, emails.length, 1).setValues(emails);
      }
    }
    migrated = true;
  }

  return migrated;
}

function repairMissingEmails_(tab, legacy) {
  var lastRow = tab.getLastRow();
  if (lastRow < 2) return;
  var first = tab.getRange(2, 1, 1, 2).getValues()[0];
  if (String(first[0] || '').trim() !== '') return;
  if (String(first[1] || '').trim() === '') return;
  var emails = [];
  for (var i = 0; i < lastRow - 1; i += 1) emails.push([legacy]);
  tab.getRange(2, 1, emails.length, 1).setValues(emails);
}

function migrateMetaTab_(sheet, legacy) {
  var tab = sheet.getSheetByName(TABS.meta);
  if (!tab) return;
  var lastRow = tab.getLastRow();
  var values = lastRow >= 2 ? tab.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  var rows = [];
  var sawSchema = false;

  for (var i = 0; i < values.length; i += 1) {
    var key = String(values[i][0] || '');
    if (!key) continue;
    var owner = key === 'app' || key === 'schema' ? GLOBAL_EMAIL : legacy;
    var value = values[i][1];
    if (key === 'schema') {
      value = SCHEMA;
      sawSchema = true;
    }
    rows.push([owner, key, value]);
  }
  if (!sawSchema) rows.push([GLOBAL_EMAIL, 'schema', SCHEMA]);

  writeAllTable_(sheet, TABS.meta, HEADERS.meta, rows);
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------

function writeUserTable_(sheet, tabName, headers, email, rows) {
  var target = sheet.getSheetByName(tabName);
  if (!target) target = sheet.insertSheet(tabName);

  var width = headers.length;
  ensureWidth_(target, width);

  var lastRow = target.getLastRow();
  var existing = lastRow >= 2
    ? target.getRange(2, 1, lastRow - 1, width).getValues()
    : [];
  var kept = [];
  for (var i = 0; i < existing.length; i += 1) {
    if (rowEmail_(existing[i]) === email) continue;
    kept.push(padRow_(existing[i], width));
  }

  var allRows = kept;
  for (var j = 0; j < rows.length; j += 1) {
    allRows.push(padRow_(rows[j], width));
  }

  var neededRows = allRows.length + 1;
  if (target.getMaxRows() < neededRows) {
    target.insertRowsAfter(target.getMaxRows(), neededRows - target.getMaxRows());
  }

  target.clearContents();
  target.getRange(1, 1, 1, width).setValues([headers]).setFontWeight('bold');
  target.setFrozenRows(1);
  if (allRows.length > 0) {
    target.getRange(2, 1, allRows.length, width).setValues(allRows);
  }
}

function writeAllTable_(sheet, tabName, headers, rows) {
  var target = sheet.getSheetByName(tabName);
  if (!target) target = sheet.insertSheet(tabName);

  var width = headers.length;
  ensureWidth_(target, width);

  var neededRows = rows.length + 1;
  if (target.getMaxRows() < neededRows) {
    target.insertRowsAfter(target.getMaxRows(), neededRows - target.getMaxRows());
  }

  target.clearContents();
  target.getRange(1, 1, 1, width).setValues([headers]).setFontWeight('bold');
  target.setFrozenRows(1);
  if (rows.length > 0) {
    var padded = [];
    for (var i = 0; i < rows.length; i += 1) padded.push(padRow_(rows[i], width));
    target.getRange(2, 1, padded.length, width).setValues(padded);
  }
}

function ensureWidth_(sheet, width) {
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }
}

function upsertUser_(sheet, email, deviceId, cards, reviews) {
  var tab = sheet.getSheetByName(TABS.users);
  if (!tab) tab = sheet.insertSheet(TABS.users);

  var headers = HEADERS.users;
  var width = headers.length;
  ensureWidth_(tab, width);

  var lastRow = tab.getLastRow();
  var rows = lastRow >= 2 ? tab.getRange(2, 1, lastRow - 1, width).getValues() : [];
  var now = Date.now();
  var found = false;

  for (var i = 0; i < rows.length; i += 1) {
    if (rowEmail_(rows[i]) !== email) continue;
    rows[i] = [
      email,
      number_(rows[i][1]) || now,
      now,
      String(deviceId || ''),
      number_(cards),
      number_(reviews)
    ];
    found = true;
    break;
  }
  if (!found) {
    rows.push([email, now, now, String(deviceId || ''), number_(cards), number_(reviews)]);
  }

  var neededRows = rows.length + 1;
  if (tab.getMaxRows() < neededRows) {
    tab.insertRowsAfter(tab.getMaxRows(), neededRows - tab.getMaxRows());
  }

  tab.clearContents();
  tab.getRange(1, 1, 1, width).setValues([headers]).setFontWeight('bold');
  tab.setFrozenRows(1);
  if (rows.length > 0) {
    var padded = [];
    for (var j = 0; j < rows.length; j += 1) padded.push(padRow_(rows[j], width));
    tab.getRange(2, 1, padded.length, width).setValues(padded);
  }
}

function eachRow_(sheet, tabName, visit) {
  var tab = sheet.getSheetByName(tabName);
  if (!tab) return;
  var lastRow = tab.getLastRow();
  if (lastRow < 2) return;
  var lastColumn = Math.max(1, tab.getLastColumn());
  var values = tab.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  for (var index = 0; index < values.length; index += 1) visit(values[index]);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function rowEmail_(row) {
  return String(row[0] || '').trim().toLowerCase();
}

function legacyEmail_(fallback) {
  var email = normalizeEmail_(LEGACY_OWNER_EMAIL);
  return email || normalizeEmail_(fallback);
}

function normalizeEmail_(value) {
  var email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 200) return '';
  if (email.indexOf(' ') !== -1) return '';
  var at = email.indexOf('@');
  var dot = email.lastIndexOf('.');
  if (at < 1 || dot <= at + 1 || dot === email.length - 1) return '';
  return email;
}

function isSheetId_(value) {
  return /^[A-Za-z0-9_-]{20,80}$/.test(String(value || ''));
}

/** Edit access covers regular Drive and both Shared Drive roles. */
function canEdit_(access) {
  if (!access) return false;
  if (access === DriveApp.Permission.EDIT) return true;
  if (access === DriveApp.Permission.OWNER) return true;
  if (access === DriveApp.Permission.ORGANIZER) return true;
  if (access === DriveApp.Permission.FILE_ORGANIZER) return true;
  return false;
}

function padRow_(row, width) {
  var result = [];
  for (var i = 0; i < width; i += 1) result.push(i < row.length ? row[i] : '');
  return result;
}

function allowed_(token) {
  if (!TOKEN) return true;
  return String(token || '') === TOKEN;
}

function blank_(value) {
  return value === '' || value === null || value === undefined;
}

function number_(value) {
  if (blank_(value)) return 0;
  var parsed = Number(value);
  return isFinite(parsed) ? parsed : 0;
}

function bridgeError_(code, message) {
  var error = new Error(message || code);
  error.wordloomCode = code;
  return error;
}

function errorText_(error) {
  return error && error.message ? String(error.message) : String(error);
}

function replyError_(error) {
  var payload = { ok: false, error: errorText_(error) };
  if (error && error.wordloomCode) payload.code = error.wordloomCode;
  return reply_(payload);
}

function reply_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
