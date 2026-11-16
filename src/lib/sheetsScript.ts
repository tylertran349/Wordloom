/**
 * The Google Apps Script that turns a spreadsheet into a Wordloom database.
 *
 * It is shipped as a plain string so the app can show it, copy it, and download
 * it. Keep this file dependency-free and free of template literals: the script
 * is copied verbatim into the Apps Script editor.
 */
export const WORDLOOM_BRIDGE_FILENAME = 'wordloom-sheet-bridge.gs';

export const WORDLOOM_BRIDGE_SOURCE = `/**
 * Wordloom <-> Google Sheets bridge
 *
 * Paste this whole file into Extensions > Apps Script in the spreadsheet you
 * want to use, then deploy it as a web app:
 *   Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Optional: set TOKEN below to a secret phrase, then enter the same phrase in
 * Wordloom. Anyone who knows the deployment URL can read and write the sheet if
 * the token is left empty, so keep the URL private either way.
 */

var TOKEN = '';

var TABS = {
  meta: 'Wordloom Meta',
  settings: 'Wordloom Settings',
  cards: 'Wordloom Cards',
  responses: 'Wordloom Responses',
  solutions: 'Wordloom Solutions',
  examples: 'Wordloom Examples',
  practice: 'Wordloom Practice',
  activity: 'Wordloom Activity',
  history: 'Wordloom Review Log'
};

var SCHEMA = 3;

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (!allowed_(params.token)) return reply_({ ok: false, error: 'unauthorized' });
    if (params.action === 'ping') return reply_(ping_());

    // Do not read while another execution is rewriting the tabs.
    var lock = LockService.getDocumentLock();
    try {
      lock.waitLock(15000);
    } catch (lockError) {
      return reply_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
    }
    try {
      return reply_({
        ok: true,
        schema: SCHEMA,
        sheetUrl: sheetUrl_(),
        state: readState_()
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

  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(25000);
  } catch (error) {
    return reply_({ ok: false, error: 'The sheet is busy. Try again in a moment.' });
  }

  try {
    var current = number_(readMeta_().updatedAt);
    var base = number_(body.baseUpdatedAt);
    // A base of 0 means "the app chose to overwrite"; only guard against a
    // sheet that changed after the app last read it.
    if (base > 0 && current > base) {
      return reply_({
        ok: false,
        conflict: true,
        sheetUrl: sheetUrl_(),
        state: readState_()
      });
    }
    var updatedAt = writeState_(body);
    return reply_({ ok: true, updatedAt: updatedAt, sheetUrl: sheetUrl_() });
  } catch (error) {
    return reply_({ ok: false, error: errorText_(error) });
  } finally {
    lock.releaseLock();
  }
}

function ping_() {
  var meta = readMeta_();
  return {
    ok: true,
    schema: SCHEMA,
    sheetUrl: sheetUrl_(),
    updatedAt: number_(meta.updatedAt),
    hasData: Object.keys(meta).length > 0
  };
}

function readState_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meta = readMeta_();

  var settings = {};
  eachRow_(ss, TABS.settings, function (row) {
    if (!row[0]) return;
    var key = String(row[0]);
    var raw = row[1];
    if (raw === '' || raw === null || raw === undefined) {
      settings[key] = '';
      return;
    }
    try {
      settings[key] = JSON.parse(String(raw));
    } catch (error) {
      settings[key] = raw;
    }
  });

  var cards = {};
  eachRow_(ss, TABS.cards, function (row) {
    if (!row[0]) return;
    var id = String(row[0]);
    cards[id] = {
      wordId: id,
      ease: number_(row[1]),
      interval: number_(row[2]),
      repetitions: number_(row[3]),
      lapses: number_(row[4]),
      due: number_(row[5]),
      createdAt: number_(row[6]),
      lastReviewed: blank_(row[7]) ? undefined : number_(row[7]),
      totalReviews: number_(row[8]),
      status: row[9] === 'review' || row[9] === 'mastered' ? String(row[9]) : 'learning'
    };
  });

  var generatedExamples = {};
  eachRow_(ss, TABS.examples, function (row) {
    if (!row[0]) return;
    var id = String(row[0]);
    var target = String(row[1] || '');
    if (!target) return;
    if (!generatedExamples[id]) generatedExamples[id] = [];
    generatedExamples[id].push({ target: target, native: String(row[2] || '') });
  });

  var generatedPractice = {};
  eachRow_(ss, TABS.practice, function (row) {
    if (!row[0]) return;
    var id = String(row[0]);
    var sentence = String(row[1] || '');
    if (!sentence) return;
    if (!generatedPractice[id]) generatedPractice[id] = [];
    generatedPractice[id].push(sentence);
  });

  var activity = {};
  eachRow_(ss, TABS.activity, function (row) {
    if (!row[0]) return;
    activity[String(row[0])] = {
      studied: number_(row[1]),
      reviews: number_(row[2])
    };
  });

  var reviewLog = [];
  eachRow_(ss, TABS.history, function (row) {
    if (!row[0]) return;
    var grade = String(row[1] || '');
    if (grade !== 'again' && grade !== 'hard' && grade !== 'good' && grade !== 'easy') return;
    reviewLog.push({
      wordId: String(row[0]),
      grade: grade,
      at: number_(row[2]),
      interval: number_(row[3])
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
    updatedAt: number_(meta.updatedAt),
    deviceId: String(meta.deviceId || ''),
    settings: settings,
    progress: {
      version: 1,
      cards: cards,
      responses: readPairs_(ss, TABS.responses),
      solutions: readPairs_(ss, TABS.solutions),
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

function writeState_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settings = body.settings || {};
  var progress = body.progress || {};
  var updatedAt = Date.now();

  writeTable_(
    ss,
    TABS.settings,
    ['key', 'value'],
    Object.keys(settings).map(function (key) {
      return [key, JSON.stringify(settings[key])];
    })
  );

  var cards = progress.cards || {};
  writeTable_(
    ss,
    TABS.cards,
    ['wordId', 'ease', 'interval', 'repetitions', 'lapses', 'due', 'createdAt', 'lastReviewed', 'totalReviews', 'status'],
    Object.keys(cards).map(function (id) {
      var card = cards[id] || {};
      return [
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

  writeTable_(ss, TABS.responses, ['key', 'value'], pairRows_(progress.responses));
  writeTable_(ss, TABS.solutions, ['key', 'value'], pairRows_(progress.solutions));

  var examples = progress.generatedExamples || {};
  var exampleRows = [];
  Object.keys(examples).forEach(function (id) {
    (examples[id] || []).forEach(function (example) {
      if (!example || !example.target) return;
      exampleRows.push([id, String(example.target), String(example.native || '')]);
    });
  });
  writeTable_(ss, TABS.examples, ['wordId', 'target', 'native'], exampleRows);

  var practice = progress.generatedPractice || {};
  var practiceRows = [];
  Object.keys(practice).forEach(function (id) {
    (practice[id] || []).forEach(function (sentence) {
      if (!sentence) return;
      practiceRows.push([id, String(sentence)]);
    });
  });
  writeTable_(ss, TABS.practice, ['wordId', 'sentence'], practiceRows);

  var activity = progress.activity || {};
  writeTable_(
    ss,
    TABS.activity,
    ['date', 'studied', 'reviews'],
    Object.keys(activity).map(function (key) {
      var day = activity[key] || {};
      return [key, number_(day.studied), number_(day.reviews)];
    })
  );

  writeTable_(
    ss,
    TABS.history,
    ['wordId', 'grade', 'at', 'interval'],
    (progress.reviewLog || []).map(function (entry) {
      return [
        String(entry.wordId || ''),
        String(entry.grade || ''),
        number_(entry.at),
        number_(entry.interval)
      ];
    })
  );

  var lastStudied = progress.lastStudied || {};
  var metaRows = [
    ['app', 'wordloom'],
    ['schema', SCHEMA],
    ['updatedAt', updatedAt],
    ['deviceId', String(body.deviceId || '')],
    ['version', number_(progress.version) || 1],
    ['reviewCount', number_(progress.reviewCount)],
    ['strongReviewCount', number_(progress.strongReviewCount)],
    ['lastStudiedWordId', lastStudied.wordId ? String(lastStudied.wordId) : ''],
    ['lastStudiedAt', lastStudied.at ? number_(lastStudied.at) : '']
  ];
  var positions = progress.levelPositions || {};
  Object.keys(positions).forEach(function (level) {
    metaRows.push(['position:' + level, number_(positions[level])]);
  });
  writeTable_(ss, TABS.meta, ['key', 'value'], metaRows);

  return updatedAt;
}

function readPositions_(meta) {
  var positions = {};
  Object.keys(meta).forEach(function (key) {
    if (key.indexOf('position:') !== 0) return;
    positions[key.slice(9)] = number_(meta[key]);
  });
  return positions;
}

function readPairs_(ss, tabName) {
  var result = {};
  eachRow_(ss, tabName, function (row) {
    if (!row[0]) return;
    result[String(row[0])] = String(row[1] === null || row[1] === undefined ? '' : row[1]);
  });
  return result;
}

function pairRows_(source) {
  var map = source || {};
  return Object.keys(map).map(function (key) {
    return [key, String(map[key] === null || map[key] === undefined ? '' : map[key])];
  });
}

function readMeta_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meta = {};
  eachRow_(ss, TABS.meta, function (row) {
    if (!row[0]) return;
    meta[String(row[0])] = row[1];
  });
  return meta;
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

function writeTable_(ss, tabName, headers, rows) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  var width = headers.length;
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  }
  var neededRows = rows.length + 1;
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, width).setValues([headers]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, width).setValues(rows);
  }
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
