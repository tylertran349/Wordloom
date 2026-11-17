import { LEGACY_OWNER_EMAIL } from './site';

/**
 * The Google Apps Script that turns a spreadsheet into a shared, multi-user
 * Wordloom database.
 *
 * It is shipped as a plain string so the app can show it, copy it, and download
 * it. Keep this file dependency-free inside the template literal and free of
 * template literals: the script is copied verbatim into the Apps Script editor.
 *
 * Schema 4 adds an `email` column to every tab. The one-time migration in
 * ensureMigrated_() assigns the old single-user rows to LEGACY_OWNER_EMAIL.
 */
export const WORDLOOM_BRIDGE_FILENAME = 'wordloom-sheet-bridge.gs';

export const WORDLOOM_BRIDGE_SOURCE = `/**
 * Wordloom Google Sheets bridge
 *
 * This script connects the Wordloom website to this spreadsheet. Wordloom
 * stores each learner separately by the email they enter.
 *
 * How to install:
 *   1. In the spreadsheet, open Extensions > Apps Script.
 *   2. Replace the code with this file and save.
 *   3. Open Deploy > New deployment > Web app.
 *      Choose "Execute as: Me" and "Who has access: Anyone".
 *   4. Deploy, authorize, and copy the web app URL ending in /exec.
 *      Put that URL in src/lib/site.ts (or VITE_WORDLOOM_BRIDGE_URL).
 *
 * Updating an existing sheet:
 *   Deploy > Manage deployments > edit the existing web app > New version.
 *   The /exec URL stays the same.
 *
 * First update: old single-user rows are moved to LEGACY_OWNER_EMAIL below.
 * Nothing is deleted.
 *
 * Optional: set TOKEN to a shared secret and enter the same phrase in the site
 * config. If TOKEN is blank, anyone with the /exec URL can read and write the
 * sheet, so keep the URL private.
 */

var TOKEN = '';

// Old single-user rows are moved to this email on the first sync after the
// update. Change it before deploying if a different account should keep them.
var LEGACY_OWNER_EMAIL = ${JSON.stringify(LEGACY_OWNER_EMAIL)};

var SCHEMA = 4;
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

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!allowed_(params.token)) return reply_({ ok: false, error: 'unauthorized' });
    if (params.action === 'ping') return reply_(ping_());

    var email = normalizeEmail_(params.email);
    if (!email) {
      return reply_({ ok: false, error: 'An email address is required to read Wordloom data.' });
    }

    // Do not read while another execution is rewriting the tabs.
    var lock = LockService.getDocumentLock();
    try {
      lock.waitLock(15000);
    } catch (lockError) {
      return reply_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
    }
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      ensureMigrated_(ss, email);
      return reply_({
        ok: true,
        schema: SCHEMA,
        sheetUrl: sheetUrl_(),
        state: readState_(ss, email)
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return reply_({ ok: false, error: errorText_(error) });
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

  if (!allowed_(body.token)) return reply_({ ok: false, error: 'unauthorized' });
  if (body.action !== 'write') return reply_({ ok: false, error: 'Unknown action.' });

  var email = normalizeEmail_(body.email);
  if (!email) {
    return reply_({ ok: false, error: 'An email address is required to save Wordloom data.' });
  }

  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(25000);
  } catch (error) {
    return reply_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureMigrated_(ss, email);

    var current = number_(readUserMeta_(ss, email).updatedAt);
    var base = number_(body.baseUpdatedAt);
    // A base of 0 means "the app chose to overwrite"; only guard against a
    // row that changed after the app last read it.
    if (base > 0 && current > base) {
      return reply_({
        ok: false,
        conflict: true,
        schema: SCHEMA,
        sheetUrl: sheetUrl_(),
        state: readState_(ss, email)
      });
    }

    var updatedAt = writeState_(ss, email, body);
    return reply_({ ok: true, schema: SCHEMA, updatedAt: updatedAt, sheetUrl: sheetUrl_() });
  } catch (error) {
    return reply_({ ok: false, error: errorText_(error) });
  } finally {
    lock.releaseLock();
  }
}

function ping_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.meta);
  var hasData = sheet ? sheet.getLastRow() > 1 : false;
  return {
    ok: true,
    schema: SCHEMA,
    sheetUrl: sheetUrl_(),
    hasData: hasData
  };
}

function readState_(ss, email) {
  var meta = readUserMeta_(ss, email);

  var settings = readSettings_(ss, email);

  var cards = {};
  eachRow_(ss, TABS.cards, function (row) {
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
  eachRow_(ss, TABS.examples, function (row) {
    if (rowEmail_(row) !== email) return;
    var id = String(row[1] || '');
    var target = String(row[2] || '');
    if (!id || !target) return;
    if (!generatedExamples[id]) generatedExamples[id] = [];
    generatedExamples[id].push({ target: target, native: String(row[3] || '') });
  });

  var generatedPractice = {};
  eachRow_(ss, TABS.practice, function (row) {
    if (rowEmail_(row) !== email) return;
    var id = String(row[1] || '');
    var sentence = String(row[2] || '');
    if (!id || !sentence) return;
    if (!generatedPractice[id]) generatedPractice[id] = [];
    generatedPractice[id].push(sentence);
  });

  var activity = {};
  eachRow_(ss, TABS.activity, function (row) {
    if (rowEmail_(row) !== email) return;
    var key = String(row[1] || '');
    if (!key) return;
    activity[key] = {
      studied: number_(row[2]),
      reviews: number_(row[3])
    };
  });

  var reviewLog = [];
  eachRow_(ss, TABS.history, function (row) {
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
      responses: readPairs_(ss, TABS.responses, email),
      solutions: readPairs_(ss, TABS.solutions, email),
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

function writeState_(ss, email, body) {
  var settings = body.settings || {};
  var progress = body.progress || {};
  var updatedAt = Date.now();

  writeUserTable_(
    ss,
    TABS.settings,
    HEADERS.settings,
    email,
    Object.keys(settings).map(function (key) {
      return [email, key, JSON.stringify(settings[key])];
    })
  );

  var cards = progress.cards || {};
  writeUserTable_(
    ss,
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

  writeUserTable_(ss, TABS.responses, HEADERS.responses, email, pairRows_(email, progress.responses));
  writeUserTable_(ss, TABS.solutions, HEADERS.solutions, email, pairRows_(email, progress.solutions));

  var examples = progress.generatedExamples || {};
  var exampleRows = [];
  Object.keys(examples).forEach(function (id) {
    (examples[id] || []).forEach(function (example) {
      if (!example || !example.target) return;
      exampleRows.push([email, id, String(example.target), String(example.native || '')]);
    });
  });
  writeUserTable_(ss, TABS.examples, HEADERS.examples, email, exampleRows);

  var practice = progress.generatedPractice || {};
  var practiceRows = [];
  Object.keys(practice).forEach(function (id) {
    (practice[id] || []).forEach(function (sentence) {
      if (!sentence) return;
      practiceRows.push([email, id, String(sentence)]);
    });
  });
  writeUserTable_(ss, TABS.practice, HEADERS.practice, email, practiceRows);

  var activity = progress.activity || {};
  writeUserTable_(
    ss,
    TABS.activity,
    HEADERS.activity,
    email,
    Object.keys(activity).map(function (key) {
      var day = activity[key] || {};
      return [email, key, number_(day.studied), number_(day.reviews)];
    })
  );

  writeUserTable_(
    ss,
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
  writeUserTable_(ss, TABS.meta, HEADERS.meta, email, metaRows);

  upsertUser_(ss, email, body.deviceId, Object.keys(cards).length, number_(progress.reviewCount));

  return updatedAt;
}

function readUserMeta_(ss, email) {
  var meta = {};
  eachRow_(ss, TABS.meta, function (row) {
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

function readPairs_(ss, tabName, email) {
  var result = {};
  eachRow_(ss, tabName, function (row) {
    if (rowEmail_(row) !== email) return;
    if (!row[1]) return;
    result[String(row[1])] = String(row[2] === null || row[2] === undefined ? '' : row[2]);
  });
  return result;
}

function readSettings_(ss, email) {
  var settings = {};
  eachRow_(ss, TABS.settings, function (row) {
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

/**
 * Schema 3 stored one learner per tab. This adds the email column and assigns
 * every existing row to LEGACY_OWNER_EMAIL, so the old data keeps working.
 */
function ensureMigrated_(ss, requestEmail) {
  var legacy = legacyEmail_(requestEmail);
  var order = ['meta', 'settings', 'cards', 'responses', 'solutions', 'examples', 'practice', 'activity', 'history'];
  var migrated = false;

  for (var i = 0; i < order.length; i += 1) {
    var key = order[i];
    var sheet = ss.getSheetByName(TABS[key]);
    if (!sheet) continue;
    if (sheet.getLastRow() < 1) continue;

    var header = String(sheet.getRange(1, 1, 1, 1).getValue() || '').trim().toLowerCase();
    if (header === 'email') {
      // If an earlier migration was interrupted between writing the header and
      // filling the email column, restore the missing owner before continuing.
      if (key !== 'meta') repairMissingEmails_(sheet, legacy);
      continue;
    }

    if (key === 'meta') {
      migrateMetaTab_(ss, legacy);
    } else {
      var lastRow = sheet.getLastRow();
      var lastColumn = Math.max(1, sheet.getLastColumn());
      var values = lastRow >= 2
        ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
        : [];
      sheet.insertColumnBefore(1);
      sheet.getRange(1, 1).setValue('email').setFontWeight('bold');
      if (values.length > 0) {
        var emails = [];
        for (var r = 0; r < values.length; r += 1) emails.push([legacy]);
        sheet.getRange(2, 1, emails.length, 1).setValues(emails);
      }
    }
    migrated = true;
  }

  return migrated;
}

/**
 * A migration that was interrupted between writing the email header and filling
 * the email column leaves old rows without an owner. If the first data row has a
 * blank email but real data beside it, fill the column again.
 */
function repairMissingEmails_(sheet, legacy) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var first = sheet.getRange(2, 1, 1, 2).getValues()[0];
  if (String(first[0] || '').trim() !== '') return;
  if (String(first[1] || '').trim() === '') return;
  var emails = [];
  for (var i = 0; i < lastRow - 1; i += 1) emails.push([legacy]);
  sheet.getRange(2, 1, emails.length, 1).setValues(emails);
}

function migrateMetaTab_(ss, legacy) {
  var sheet = ss.getSheetByName(TABS.meta);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  var values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
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

  writeAllTable_(ss, TABS.meta, HEADERS.meta, rows);
}

function writeUserTable_(ss, tabName, headers, email, rows) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);

  var width = headers.length;
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  var lastRow = sheet.getLastRow();
  var existing = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, width).getValues()
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
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, width).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (allRows.length > 0) {
    sheet.getRange(2, 1, allRows.length, width).setValues(allRows);
  }
}

function writeAllTable_(ss, tabName, headers, rows) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);

  var width = headers.length;
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }
  var neededRows = rows.length + 1;
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, width).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (rows.length > 0) {
    var padded = [];
    for (var i = 0; i < rows.length; i += 1) padded.push(padRow_(rows[i], width));
    sheet.getRange(2, 1, padded.length, width).setValues(padded);
  }
}

function upsertUser_(ss, email, deviceId, cards, reviews) {
  var sheet = ss.getSheetByName(TABS.users);
  if (!sheet) sheet = ss.insertSheet(TABS.users);

  var headers = HEADERS.users;
  var width = headers.length;
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }

  var lastRow = sheet.getLastRow();
  var rows = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];
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
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, width).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (rows.length > 0) {
    var padded = [];
    for (var j = 0; j < rows.length; j += 1) padded.push(padRow_(rows[j], width));
    sheet.getRange(2, 1, padded.length, width).setValues(padded);
  }
}

function eachRow_(ss, tabName, visit) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var lastColumn = Math.max(1, sheet.getLastColumn());
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  for (var index = 0; index < values.length; index += 1) visit(values[index]);
}

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

function padRow_(row, width) {
  var result = [];
  for (var i = 0; i < width; i += 1) result.push(i < row.length ? row[i] : '');
  return result;
}

function sheetUrl_() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
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

function errorText_(error) {
  return error && error.message ? String(error.message) : String(error);
}

function reply_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON
  );
}
`;
