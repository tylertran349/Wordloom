/**
 * Parsers for word lists copied from Quizlet, spreadsheets, CSV exports, JSON,
 * and plain text. Everything runs in the browser; imported text is never sent
 * anywhere.
 *
 * Accepted shapes:
 *   - Quizlet / Anki: one `term<TAB>definition` pair per line.
 *   - CSV/TSV with or without a header row. Columns: term, definition,
 *     part of speech, tags. Header aliases include word/meaning/front/back.
 *   - JSON: an array of objects, arrays, or a wrapper such as `{ words: [...] }`.
 *   - Plain text: `term - definition`, `term = definition`, `term; definition`,
 *     `term | definition`, or `term: definition`.
 */

const MAX_WORDS = 5_000;
const MAX_TERM_LENGTH = 120;
const MAX_DEFINITION_LENGTH = 600;
const MAX_TAGS = 8;

/** Total imported vocabulary kept in settings, across every import. */
export const MAX_CUSTOM_WORDS = 10_000;

export type ImportFormat = 'quizlet' | 'csv' | 'json' | 'text' | 'empty';

export interface ImportedWordEntry {
  term: string;
  definition: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definitionTarget?: string;
  tags: string[];
}

export interface WordListParseResult {
  entries: ImportedWordEntry[];
  format: ImportFormat;
  formatLabel: string;
  /** Rows that looked like data, including skipped and duplicate rows. */
  totalRows: number;
  /** Rows without both a term and a definition. */
  skipped: number;
  /** Repeats of a term already seen in this same paste. */
  duplicates: number;
  warnings: string[];
  delimiter?: string;
  headerDetected: boolean;
}

type Field =
  | 'term'
  | 'definition'
  | 'partOfSpeech'
  | 'pronunciation'
  | 'definitionTarget'
  | 'tags';

const FIELD_ALIASES: Record<Field, string[]> = {
  term: [
    'term',
    'word',
    'front',
    'prompt',
    'question',
    'expression',
    'keyword',
    'phrase',
    'target',
    'targetword',
  ],
  definition: [
    'definition',
    'meaning',
    'back',
    'answer',
    'translation',
    'gloss',
    'explanation',
    'native',
    'nativeword',
    'english',
    'vietnamese',
    'definitionnative',
    'targettranslation',
  ],
  partOfSpeech: ['partofspeech', 'pos', 'type', 'wordclass'],
  pronunciation: ['pronunciation', 'ipa', 'reading', 'phonetic', 'pinyin'],
  definitionTarget: [
    'definitiontarget',
    'targetdefinition',
    'targetmeaning',
    'foreigndefinition',
  ],
  tags: ['tags', 'tag', 'topics', 'topic', 'labels', 'label', 'deck', 'category'],
};

const ALIAS_LOOKUP = new Map<string, Field>();
Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
  aliases.forEach((alias) => {
    if (!ALIAS_LOOKUP.has(alias)) ALIAS_LOOKUP.set(alias, field as Field);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove full-line `#` and `//` comments without touching quoted CSV fields
 * that may span lines.
 */
function stripCommentLines(raw: string): string {
  const source = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const kept: string[] = [];
  let inQuotes = false;

  source.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!inQuotes && (trimmed.startsWith('#') || trimmed.startsWith('//'))) {
      return;
    }
    kept.push(line);
    for (let index = 0; index < line.length; index += 1) {
      if (line.charAt(index) !== '"') continue;
      if (inQuotes && line.charAt(index + 1) === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
    }
  });

  return kept.join('\n');
}

export function normalizeTermKey(term: string): string {
  return clean(term).normalize('NFC').toLowerCase();
}

/** Turn a term into a URL-safe slug, keeping Vietnamese letters readable. */
export function slugifyTerm(term: string): string {
  const slug = clean(term)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'word';
}

/**
 * Custom ids are prefixed so they can never collide with the generated deck.
 * If a slug is already taken (two different terms slugify the same way), a
 * numeric suffix keeps every word addressable.
 */
export function createCustomWordId(term: string, takenIds: Set<string>): string {
  const base = `custom-${slugifyTerm(term)}`;
  if (!takenIds.has(base)) return base;
  let suffix = 2;
  while (takenIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function normalizeHeader(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((tag) => clean(tag))
    : typeof value === 'string'
      ? value.split(/[,;|]/)
      : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  raw.forEach((tag) => {
    const cleaned = clean(tag).slice(0, 30);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key) || tags.length >= MAX_TAGS) return;
    seen.add(key);
    tags.push(cleaned);
  });
  return tags;
}

type PushResult = 'added' | 'duplicate' | 'invalid';

function createCollector() {
  const entries: ImportedWordEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;

  function push(input: ImportedWordEntry): PushResult {
    const term = clean(input.term).slice(0, MAX_TERM_LENGTH);
    const definition = clean(input.definition).slice(0, MAX_DEFINITION_LENGTH);
    if (!term || !definition) {
      skipped += 1;
      return 'invalid';
    }
    const key = normalizeTermKey(term);
    if (seen.has(key)) {
      duplicates += 1;
      return 'duplicate';
    }
    seen.add(key);
    entries.push({
      term,
      definition,
      partOfSpeech: clean(input.partOfSpeech).slice(0, 40) || undefined,
      pronunciation: clean(input.pronunciation).slice(0, 80) || undefined,
      definitionTarget:
        clean(input.definitionTarget).slice(0, MAX_DEFINITION_LENGTH) || undefined,
      tags: parseTags(input.tags),
    });
    return 'added';
  }

  return {
    push,
    entries,
    get skipped() {
      return skipped;
    },
    get duplicates() {
      return duplicates;
    },
  };
}

/** Split delimited text into rows, honouring quotes and embedded newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (inQuotes) {
      if (character === '"') {
        if (source.charAt(index + 1) === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.trim() === '') {
      field = '';
      inQuotes = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

function mapHeader(row: string[] | undefined): Partial<Record<Field, number>> | null {
  if (!row) return null;
  const mapping: Partial<Record<Field, number>> = {};
  row.forEach((cell, index) => {
    const field = ALIAS_LOOKUP.get(normalizeHeader(cell));
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  if (mapping.term === undefined || mapping.definition === undefined) return null;
  return mapping;
}

function rowToEntry(
  row: string[],
  mapping: Partial<Record<Field, number>>,
  positional: Partial<Record<Field, number>>,
): ImportedWordEntry {
  const at = (field: Field): string => {
    const index = mapping[field] ?? positional[field];
    if (index === undefined) return '';
    return row[index] ?? '';
  };
  return {
    term: at('term'),
    definition: at('definition'),
    partOfSpeech: at('partOfSpeech'),
    pronunciation: at('pronunciation'),
    definitionTarget: at('definitionTarget'),
    tags: parseTags(at('tags')),
  };
}

const POSITIONAL_COLUMNS: Partial<Record<Field, number>> = {
  term: 0,
  definition: 1,
  partOfSpeech: 2,
  tags: 3,
};

function parseRows(rows: string[][], delimiter: string) {
  const collector = createCollector();
  const header = mapHeader(rows[0]);
  const dataRows = header ? rows.slice(1) : rows;
  dataRows.forEach((row) => {
    collector.push(rowToEntry(row, header ?? {}, POSITIONAL_COLUMNS));
  });
  return {
    entries: collector.entries,
    skipped: collector.skipped,
    duplicates: collector.duplicates,
    totalRows: dataRows.length,
    headerDetected: Boolean(header),
    delimiter,
  };
}

function scoreDelimiter(text: string, delimiter: string): number {
  const rows = parseDelimited(text, delimiter)
    .slice(0, 12)
    .filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) return 0;
  const counts = rows.map((row) => row.length);
  const withTwo = counts.filter((count) => count >= 2).length;
  if (withTwo === 0) return 0;
  const frequency = new Map<number, number>();
  counts.forEach((count) => frequency.set(count, (frequency.get(count) ?? 0) + 1));
  const consistency = Math.max(...frequency.values());
  const average = counts.reduce((total, count) => total + count, 0) / counts.length;
  return withTwo * 100 + consistency * 10 + average;
}

function looksLikePlainLine(line: string): boolean {
  // Ignore separators inside quoted fields, so quoted CSV definitions do not
  // look like "term - meaning" lines.
  const source = line.replace(/"[^"]*"/g, '""');
  const separator = source.match(/\t+|\s+[–—=]\s+|\s+-\s+|\s*\|\s*|\s*;\s*|\s+:\s+/);
  if (!separator || separator.index === undefined) return false;
  // If the part before the separator already looks like CSV columns, the line
  // is probably a delimited row whose definition happens to contain a dash.
  const prefix = source.slice(0, separator.index);
  return !/[,;]/.test(prefix);
}

const PLAIN_SEPARATOR =
  /^(.+?)(?:\t+|\s+[–—=]\s+|\s+-\s+|\s*\|\s*|\s*;\s*|\s+:\s+)(.+)$/;

function parsePlainText(text: string) {
  const collector = createCollector();
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);
  let headerChecked = false;
  lines.forEach((line) => {
    const match = line.match(PLAIN_SEPARATOR);
    if (!match) {
      collector.push({ term: line, definition: '', tags: [] });
      return;
    }
    const term = clean(match[1]);
    const definition = clean(match[2]);
    if (!headerChecked) {
      headerChecked = true;
      const termKey = normalizeTermKey(term);
      const definitionKey = normalizeTermKey(definition);
      const looksLikeHeader =
        (termKey === 'term' || termKey === 'word' || termKey === 'front') &&
        (definitionKey === 'definition' ||
          definitionKey === 'meaning' ||
          definitionKey === 'translation' ||
          definitionKey === 'back');
      if (looksLikeHeader) return;
    }
    collector.push({ term, definition, tags: [] });
  });
  return {
    entries: collector.entries,
    skipped: collector.skipped,
    duplicates: collector.duplicates,
    totalRows: lines.length,
  };
}

function readObjectField(
  record: Record<string, unknown>,
  field: Field,
): unknown {
  for (const [key, value] of Object.entries(record)) {
    if (ALIAS_LOOKUP.get(normalizeHeader(key)) === field) return value;
  }
  return undefined;
}

function parseJsonText(text: string): WordListParseResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  let list: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (isRecord(parsed)) {
    const wrapperKeys = ['words', 'terms', 'items', 'entries', 'data', 'list', 'vocabulary'];
    for (const key of wrapperKeys) {
      if (Array.isArray(parsed[key])) {
        list = parsed[key] as unknown[];
        break;
      }
    }
    if (!list) list = [parsed];
  }
  if (!list) return null;

  const first = list[0];
  const headerRow =
    Array.isArray(first) && mapHeader(first.map((cell) => (typeof cell === 'string' ? cell : '')));
  const rows = headerRow ? list.slice(1) : list;

  const collector = createCollector();
  rows.forEach((item) => {
    if (typeof item === 'string') {
      collector.push({ term: item, definition: '', tags: [] });
      return;
    }
    if (Array.isArray(item)) {
      collector.push({
        term: typeof item[0] === 'string' ? item[0] : '',
        definition: typeof item[1] === 'string' ? item[1] : '',
        partOfSpeech: typeof item[2] === 'string' ? item[2] : '',
        tags: typeof item[3] === 'string' ? parseTags(item[3]) : [],
      });
      return;
    }
    if (!isRecord(item)) {
      collector.push({ term: '', definition: '', tags: [] });
      return;
    }
    collector.push({
      term: clean(readObjectField(item, 'term')),
      definition: clean(readObjectField(item, 'definition')),
      partOfSpeech: clean(readObjectField(item, 'partOfSpeech')),
      pronunciation: clean(readObjectField(item, 'pronunciation')),
      definitionTarget: clean(readObjectField(item, 'definitionTarget')),
      tags: parseTags(readObjectField(item, 'tags')),
    });
  });

  const warnings: string[] = [];
  if (collector.skipped > 0) {
    warnings.push(
      `${collector.skipped} ${collector.skipped === 1 ? 'entry was' : 'entries were'} skipped because a term or definition was missing.`,
    );
  }
  if (collector.duplicates > 0) {
    warnings.push(
      `${collector.duplicates} duplicate ${collector.duplicates === 1 ? 'term was' : 'terms were'} ignored.`,
    );
  }

  return {
    entries: collector.entries.slice(0, MAX_WORDS),
    format: 'json',
    formatLabel: 'JSON',
    totalRows: rows.length,
    skipped: collector.skipped,
    duplicates: collector.duplicates,
    warnings:
      collector.entries.length > MAX_WORDS
        ? [...warnings, `Only the first ${MAX_WORDS.toLocaleString()} words were kept.`]
        : warnings,
    headerDetected: false,
  };
}

/**
 * Parse a pasted or uploaded word list. The parser is intentionally forgiving:
 * it picks the most likely delimiter and header layout, then reports any rows
 * it could not use so the learner can fix the source before importing.
 */
export function parseWordList(raw: string): WordListParseResult {
  const text = stripCommentLines(raw);
  if (!text.trim()) {
    return {
      entries: [],
      format: 'empty',
      formatLabel: 'No list yet',
      totalRows: 0,
      skipped: 0,
      duplicates: 0,
      warnings: [],
      headerDetected: false,
    };
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const json = parseJsonText(trimmed);
    if (json) return json;
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);

  if (lines.length === 0) {
    return {
      entries: [],
      format: 'empty',
      formatLabel: 'No list yet',
      totalRows: 0,
      skipped: 0,
      duplicates: 0,
      warnings: [],
      headerDetected: false,
    };
  }

  // A header row is the strongest signal for the delimiter.
  for (const delimiter of ['\t', ',', ';']) {
    const firstRow = parseDelimited(lines[0], delimiter)[0];
    if (mapHeader(firstRow)) {
      const result = parseRows(parseDelimited(text, delimiter), delimiter);
      return withWarnings({
        ...result,
        format: delimiter === '\t' ? 'quizlet' : 'csv',
        formatLabel: delimiter === '\t' ? 'Quizlet / spreadsheet' : 'CSV',
      });
    }
  }

  const tabCount = lines.filter((line) => line.includes('\t')).length;
  if (tabCount >= Math.ceil(lines.length / 2)) {
    const result = parseRows(parseDelimited(text, '\t'), '\t');
    return withWarnings({
      ...result,
      format: 'quizlet',
      formatLabel: 'Quizlet / tab-separated',
    });
  }

  // "term - definition" style lists beat fragile comma detection.
  const plainCount = lines.filter(looksLikePlainLine).length;
  if (plainCount >= Math.ceil(lines.length / 2)) {
    const result = parsePlainText(text);
    return withWarnings({ ...result, format: 'text', formatLabel: 'Plain text', headerDetected: false });
  }

  const candidates: Array<{ delimiter: string; score: number }> = [
    { delimiter: ',', score: scoreDelimiter(text, ',') },
    { delimiter: ';', score: scoreDelimiter(text, ';') },
  ].sort((a, b) => b.score - a.score);

  if (candidates[0].score > 0) {
    const delimiter = candidates[0].delimiter;
    const result = parseRows(parseDelimited(text, delimiter), delimiter);
    return withWarnings({ ...result, format: 'csv', formatLabel: 'CSV' });
  }

  const result = parsePlainText(text);
  return withWarnings({
    ...result,
    format: 'text',
    formatLabel: 'Plain text',
    headerDetected: false,
  });
}

function withWarnings(
  result: Omit<WordListParseResult, 'warnings'> | WordListParseResult,
): WordListParseResult {
  const warnings = 'warnings' in result ? [...result.warnings] : [];
  if (result.skipped > 0) {
    warnings.push(
      `${result.skipped} ${result.skipped === 1 ? 'row was' : 'rows were'} skipped because a term or definition was missing.`,
    );
  }
  if (result.duplicates > 0) {
    warnings.push(
      `${result.duplicates} duplicate ${result.duplicates === 1 ? 'term was' : 'terms were'} ignored.`,
    );
  }
  if (result.entries.length > MAX_WORDS) {
    warnings.push(`Only the first ${MAX_WORDS.toLocaleString()} words were kept.`);
  }
  return {
    ...result,
    entries: result.entries.slice(0, MAX_WORDS),
    warnings,
  };
}
