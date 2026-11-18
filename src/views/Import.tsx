import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Braces,
  ClipboardPaste,
  FileSpreadsheet,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import type { CEFRLevel, CustomWord } from '../types';
import { CEFR_LEVELS } from '../types';
import { LEVEL_INFO } from '../data/levels';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import { cn, formatShortDate, pluralize } from '../lib/utils';
import { normalizeTermKey, parseWordList } from '../lib/wordImport';
import {
  AppLink,
  ConfirmDialog,
  EmptyState,
  LevelBadge,
  PageHeader,
} from '../components/ui';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const PREVIEW_LIMIT = 12;

function tagsFromInput(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((tag) => tag.replace(/\s+/g, ' ').trim().slice(0, 30))
    .filter(Boolean);
}

export function Import({ initialLevel }: { initialLevel?: CEFRLevel }) {
  const {
    settings,
    levelCounts,
    customWords,
    reservedTermKeys,
    importWords,
    removeCustomWord,
    clearCustomWords,
    notify,
  } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [level, setLevel] = useState<CEFRLevel>(initialLevel ?? 'A1');
  const [tagsInput, setTagsInput] = useState('');
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const parsed = useMemo(() => parseWordList(text), [text]);
  const preview = useMemo(
    () =>
      parsed.entries.map((entry) => ({
        ...entry,
        duplicate: reservedTermKeys.has(normalizeTermKey(entry.term)),
      })),
    [parsed.entries, reservedTermKeys],
  );
  const importableCount = preview.filter((entry) => !entry.duplicate).length;
  const duplicateCount = preview.length - importableCount;
  const lineCount = text
    ? text.split(/\r?\n/).filter((line) => line.trim()).length
    : 0;

  const visibleImported = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...customWords]
      .sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0))
      .filter((word) => {
        if (!needle) return true;
        return `${word.term} ${word.definition} ${(word.tags ?? []).join(' ')}`
          .toLowerCase()
          .includes(needle);
      });
  }, [customWords, search]);

  const importedByLevel = CEFR_LEVELS.map((entry) => ({
    level: entry,
    count: customWords.filter((word) => word.level === entry).length,
  })).filter((entry) => entry.count > 0);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('That file is larger than 4 MB. Import a smaller list.');
      return;
    }
    try {
      const contents = await file.text();
      setText(contents);
      setFileName(file.name);
      setFileError(null);
    } catch {
      setFileError('Wordloom could not read that file. Try a .csv, .tsv, .txt, or .json file.');
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  function clearSource() {
    setText('');
    setFileName('');
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleImport() {
    if (importableCount === 0) return;
    const result = importWords(parsed.entries, level, {
      tags: tagsFromInput(tagsInput),
      source: fileName || parsed.formatLabel,
    });
    if (result.added > 0) {
      const skipped =
        result.skipped > 0 ? ` ${result.skipped} skipped as duplicates or incomplete.` : '';
      notify(
        `Imported ${result.added} ${pluralize(result.added, 'word')} into ${level}.${skipped}`,
      );
      clearSource();
      setTagsInput('');
    } else {
      notify('Those words are already in this deck. Nothing was added.', 'info');
    }
  }

  function handleRemove(word: CustomWord) {
    removeCustomWord(word.id);
    notify(`Removed “${word.term}”. Add or import it again to bring it back.`, 'info');
  }

  return (
    <div className="view">
      <PageHeader
        eyebrow="Your own words"
        title={
          <>
            Import <span className="title-muted">word lists</span>
          </>
        }
        description="Paste a Quizlet export, drop a CSV, or reuse a JSON list. Imported and hand-added words join your CEFR deck and take part in study, review, progress, and Google Sheets sync."
        actions={
          <span className="streak-pill">
            <ShieldCheck size={15} aria-hidden="true" />
            Parsed in this browser
          </span>
        }
      />

      <div className="import-grid">
        <div className="import-stack">
          <section className="settings-section import-source">
            <div className="settings-section-head">
              <div>
                <span className="eyebrow">Step 1</span>
                <h2>Paste or choose a file</h2>
                <p>
                  One word per line works best. CSV/TSV columns are read as word, meaning, part of
                  speech, and tags.
                </p>
              </div>
              <span className="import-format-badge">{parsed.formatLabel}</span>
            </div>
            <div className="settings-section-body">
              <div
                className={cn('import-dropzone', dragging && 'is-active')}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  // Child elements fire dragleave as the pointer crosses them;
                  // only clear the highlight when the drag leaves the zone.
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDragging(false);
                }}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Choose a word list file"
              >
                <span className="import-dropzone-icon">
                  <Upload size={20} aria-hidden="true" />
                </span>
                <span className="import-dropzone-copy">
                  <strong>{fileName || 'Drop a file here, or browse'}</strong>
                  <span>.csv, .tsv, .txt, or .json · up to 4 MB</span>
                </span>
                <span className="button button-ghost button-small">
                  Choose file
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json"
                className="sr-only"
                aria-label="Choose a word list file"
                onChange={(event) => {
                  void readFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />

              <label className="import-source-label" htmlFor="import-text">
                Or paste your list
              </label>
              <textarea
                id="import-text"
                className="import-textarea"
                value={text}
                spellCheck={false}
                placeholder={
                  'xin chào\thello\ncảm ơn\tthank you\n\n# or CSV:\nterm,definition,tags\nxin chào,hello,greetings'
                }
                onChange={(event) => {
                  setText(event.target.value);
                  if (fileName) setFileName('');
                }}
              />

              <div className="import-source-foot">
                <span>
                  {lineCount} {pluralize(lineCount, 'line')} read · {parsed.entries.length}{' '}
                  {pluralize(parsed.entries.length, 'pair')} found
                </span>
                {(text || fileName) && (
                  <button type="button" className="text-link" onClick={clearSource}>
                    Clear
                  </button>
                )}
              </div>

              {fileError && (
                <div className="inline-alert is-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{fileError}</span>
                </div>
              )}
              {text.trim() !== '' && parsed.warnings.length > 0 && (
                <div className="import-warnings">
                  <strong>
                    <AlertCircle size={14} aria-hidden="true" />
                    Check before importing
                  </strong>
                  <ul>
                    {parsed.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section className="settings-section import-preview">
            <div className="settings-section-head">
              <div>
                <span className="eyebrow">Step 2</span>
                <h2>Preview and import</h2>
                <p>Choose the deck that fits this list. Terms you already have are skipped.</p>
              </div>
              <span className="section-count">
                {parsed.entries.length} {pluralize(parsed.entries.length, 'word')}
              </span>
            </div>
            <div className="settings-section-body">
              <div className="import-options">
                <div className="import-field">
                  <span className="import-field-label">Add to deck</span>
                  <div className="import-level-picker" role="group" aria-label="Import into CEFR level">
                    {CEFR_LEVELS.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        className={cn('import-level-option', entry === level && 'is-active')}
                        data-level={entry}
                        onClick={() => setLevel(entry)}
                        aria-pressed={entry === level}
                        title={`${entry} · ${LEVEL_INFO[entry].subtitle}`}
                      >
                        {entry}
                        <span>{levelCounts[entry]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="import-field import-tags-field">
                  <label className="import-field-label" htmlFor="import-tags">
                    Tags for this list <span>optional</span>
                  </label>
                  <input
                    id="import-tags"
                    className="text-input"
                    value={tagsInput}
                    placeholder="business, travel"
                    autoComplete="off"
                    onChange={(event) => setTagsInput(event.target.value)}
                  />
                </div>
              </div>

              {preview.length === 0 ? (
                <div className="import-empty">
                  <ClipboardPaste size={20} aria-hidden="true" />
                  <p>
                    Paste a list or choose a file above. A preview appears here before anything is
                    added to your deck.
                  </p>
                </div>
              ) : (
                <>
                  <div className="import-table-wrap">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th scope="col">Word</th>
                          <th scope="col">Meaning</th>
                          <th scope="col">Part of speech</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, PREVIEW_LIMIT).map((entry, index) => (
                          <tr key={`${entry.term}-${index}`}>
                            <td>
                              <strong className="lang-target" lang={target.code}>
                                {entry.term}
                              </strong>
                              {(entry.tags ?? []).length > 0 && (
                                <span className="import-row-tags">
                                  {entry.tags.slice(0, 3).map((tag, index) => (
                                    <span key={`${tag}-${index}`}>{tag}</span>
                                  ))}
                                </span>
                              )}
                            </td>
                            <td lang={native.code}>{entry.definition}</td>
                            <td>{entry.partOfSpeech || '—'}</td>
                            <td>
                              {entry.duplicate ? (
                                <span className="status-pill status-seen">Already used</span>
                              ) : (
                                <span className="status-pill status-new">New</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.length > PREVIEW_LIMIT && (
                    <p className="import-preview-more">
                      Showing {PREVIEW_LIMIT} of {preview.length}. The rest will import too.
                    </p>
                  )}
                  <div className="import-actions">
                    <span className="import-actions-copy">
                      {importableCount} new {pluralize(importableCount, 'word')}
                      {duplicateCount > 0
                        ? ` · ${duplicateCount} already ${duplicateCount === 1 ? 'exists' : 'exist'}`
                        : ''}
                    </span>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={handleImport}
                      disabled={importableCount === 0}
                    >
                      <Sparkles size={15} aria-hidden="true" />
                      {importableCount > 0
                        ? `Import ${importableCount} ${pluralize(importableCount, 'word')} into ${level}`
                        : 'Nothing new to import'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <aside className="import-guide">
          <section className="settings-section">
            <div className="settings-section-head">
              <div>
                <span className="eyebrow">Formats</span>
                <h2>What you can paste</h2>
                <p>The parser detects the layout automatically. A header row makes columns explicit.</p>
              </div>
            </div>
            <div className="import-guide-list">
              <div className="import-guide-item">
                <span className="import-guide-icon"><ClipboardPaste size={15} /></span>
                <div>
                  <strong>Quizlet</strong>
                  <span>Copy a set from Export, then paste the two columns.</span>
                  <pre>{'term\tdefinition'}</pre>
                </div>
              </div>
              <div className="import-guide-item">
                <span className="import-guide-icon"><Table2 size={15} /></span>
                <div>
                  <strong>Spreadsheet / CSV</strong>
                  <span>Copy cells from Excel or Google Sheets. Headers are optional.</span>
                  <pre>{'term,definition,part of speech,tags'}</pre>
                </div>
              </div>
              <div className="import-guide-item">
                <span className="import-guide-icon"><Braces size={15} /></span>
                <div>
                  <strong>JSON</strong>
                  <span>An array of objects, arrays, or a wrapper such as “words”.</span>
                  <pre>{'[{ "term": "xin chào", "definition": "hello" }]'}</pre>
                </div>
              </div>
              <div className="import-guide-item">
                <span className="import-guide-icon"><FileSpreadsheet size={15} /></span>
                <div>
                  <strong>Plain text</strong>
                  <span>One pair per line with a dash, equals sign, or semicolon.</span>
                  <pre>{'xin chào - hello'}</pre>
                </div>
              </div>
            </div>
            <div className="settings-note is-compact">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <strong>Nothing is uploaded</strong>
                <p>
                  Parsing happens in this browser. Custom words are saved with your settings,
                  included in JSON backups, and synced to your own Google Sheet when sync is on.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="settings-section import-library">
        <div className="settings-section-head">
          <div>
            <span className="eyebrow">Your library</span>
            <h2>Custom words</h2>
            <p>
              {customWords.length > 0
                ? `${customWords.length} ${pluralize(customWords.length, 'word')} imported or added by hand. Removing one keeps its study progress in case you add it again.`
                : 'Words you import or add by hand will appear here. You can remove a word without touching the built-in deck.'}
            </p>
          </div>
          <div className="import-library-actions">
            {importedByLevel.map((entry) => (
              <span key={entry.level} className="import-library-level" data-level={entry.level}>
                {entry.level}
                <strong>{entry.count}</strong>
              </span>
            ))}
            {customWords.length > 0 && (
              <button
                type="button"
                className="button button-danger button-small"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear all
              </button>
            )}
          </div>
        </div>

        {customWords.length === 0 ? (
          <div className="settings-section-body">
            <EmptyState
              icon={<BookOpen size={22} />}
              title="No custom words yet"
              description="Import a Quizlet, CSV, JSON, or plain-text list — or open a CEFR deck and use Add word. Custom words are studied and reviewed alongside the built-in deck."
              action={
                <div className="empty-button-row">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText size={15} aria-hidden="true" />
                    Choose a file
                  </button>
                  <AppLink to={{ name: 'level', level }} className="button button-ghost">
                    <BookOpen size={15} aria-hidden="true" />
                    Open {level} deck
                  </AppLink>
                </div>
              }
            />
          </div>
        ) : (
          <div className="settings-section-body">
            <div className="deck-toolbar import-library-toolbar">
              <div className="search-box">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search custom words"
                  aria-label="Search custom words"
                />
              </div>
              <span className="import-library-count">
                {visibleImported.length} of {customWords.length}
              </span>
            </div>
            {visibleImported.length === 0 ? (
              <div className="import-empty">
                <Search size={20} aria-hidden="true" />
                <p>No custom words match “{search.trim()}”.</p>
              </div>
            ) : (
              <div className="imported-list">
                {visibleImported.map((word) => (
                  <div className="imported-row" key={word.id}>
                    <LevelBadge level={word.level} />
                    <div className="imported-word">
                      <AppLink
                        to={{ name: 'word', level: word.level, wordId: word.id }}
                        className="imported-word-link"
                      >
                        <strong className="lang-target" lang={target.code}>{word.term}</strong>
                        <span lang={native.code}>{word.definition}</span>
                      </AppLink>
                      <div className="imported-meta">
                        {word.partOfSpeech && <span>{word.partOfSpeech}</span>}
                        {(word.tags ?? []).slice(0, 4).map((tag, index) => (
                          <span key={`${tag}-${index}`}>{tag}</span>
                        ))}
                        <span>
                          {word.source ? `${word.source} · ` : ''}
                          {word.importedAt
                            ? formatShortDate(word.importedAt)
                            : 'imported'}
                        </span>
                      </div>
                    </div>
                    <div className="imported-actions">
                      <AppLink
                        to={{ name: 'word', level: word.level, wordId: word.id }}
                        className="button button-ghost button-small"
                      >
                        Study
                        <ArrowRight size={14} aria-hidden="true" />
                      </AppLink>
                      <button
                        type="button"
                        className="icon-button imported-remove"
                        onClick={() => handleRemove(word)}
                        aria-label={`Remove ${word.term} from custom words`}
                        title="Remove from custom words"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {confirmClear && (
        <ConfirmDialog
          title="Remove every custom word?"
          description={
            <p>
              All {customWords.length} custom {pluralize(customWords.length, 'word')} will leave your
              decks. Study progress and generated exercises are kept in case you add or import the
              same words again. The built-in vocabulary is not touched.
            </p>
          }
          confirmLabel="Yes, remove them"
          cancelLabel="Keep them"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            setConfirmClear(false);
            clearCustomWords();
            notify('Custom words removed. Built-in vocabulary is untouched.', 'info');
          }}
        />
      )}
    </div>
  );
}
