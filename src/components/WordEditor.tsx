import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RotateCcw, X } from 'lucide-react';
import type { CEFRLevel, WordInput } from '../types';
import { CEFR_LEVELS } from '../types';
import { LEVEL_INFO } from '../data/levels';
import { cn } from '../lib/utils';
import { useDialogModal } from '../hooks/useDialogModal';
import type { WordActionResult } from '../context/AppContext';

export interface WordEditorProps {
  mode: 'add' | 'edit';
  initial: WordInput;
  isCustom: boolean;
  canReset: boolean;
  onCancel: () => void;
  onSave: (input: WordInput) => WordActionResult;
  onReset?: () => void;
}

function parseTagInput(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((tag) => tag.replace(/\s+/g, ' ').trim().slice(0, 30))
    .filter(Boolean);
}

export function WordEditor({
  mode,
  initial,
  isCustom,
  canReset,
  onCancel,
  onSave,
  onReset,
}: WordEditorProps) {
  const titleId = useId();
  const noteId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useDialogModal(dialogRef, firstFieldRef, onCancel);

  const [term, setTerm] = useState(initial.term);
  const [definition, setDefinition] = useState(initial.definition);
  const [level, setLevel] = useState<CEFRLevel>(initial.level);
  const [partOfSpeech, setPartOfSpeech] = useState(initial.partOfSpeech ?? '');
  const [pronunciation, setPronunciation] = useState(initial.pronunciation ?? '');
  const [definitionTarget, setDefinitionTarget] = useState(initial.definitionTarget ?? '');
  const [tags, setTags] = useState((initial.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);

  const valid = term.trim().length > 0 && definition.trim().length > 0;
  const editingBuiltIn = mode === 'edit' && !isCustom;

  function clearError() {
    if (error) setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    const result = onSave({
      term: term.trim(),
      definition: definition.trim(),
      level,
      partOfSpeech,
      pronunciation,
      definitionTarget,
      tags: parseTagInput(tags),
    });
    if (!result.ok) setError(result.message);
  }

  return createPortal(
    <div
      className="confirm-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={dialogRef}
        className="confirm-dialog word-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
        onSubmit={handleSubmit}
      >
        <div className="word-editor-head">
          <div>
            <span className="eyebrow">
              {mode === 'add' ? 'New word' : isCustom ? 'Custom word' : 'Built-in word'}
            </span>
            <h2 id={titleId}>
              {mode === 'add' ? `Add a word to ${level}` : 'Edit word'}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button word-editor-close"
            onClick={onCancel}
            aria-label="Close word editor"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="word-editor-grid">
          <label className="field-block">
            <span>Word <span className="optional">required</span></span>
            <input
              ref={firstFieldRef}
              className="text-input"
              value={term}
              required
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setTerm(event.target.value);
                clearError();
              }}
            />
          </label>

          <label className="field-block">
            <span>CEFR level</span>
            <span className="select-wrap">
              <select
                className="select-input"
                value={level}
                onChange={(event) => {
                  setLevel(event.target.value as CEFRLevel);
                  clearError();
                }}
              >
                {CEFR_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {option} · {LEVEL_INFO[option].subtitle}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="select-chevron" aria-hidden="true" />
            </span>
          </label>

          <label className="field-block is-full">
            <span>Meaning <span className="optional">required</span></span>
            <textarea
              className="text-input word-editor-textarea"
              value={definition}
              required
              maxLength={600}
              rows={3}
              onChange={(event) => {
                setDefinition(event.target.value);
                clearError();
              }}
            />
          </label>

          <label className="field-block">
            <span>Part of speech <span className="optional">optional</span></span>
            <input
              className="text-input"
              value={partOfSpeech}
              maxLength={40}
              autoComplete="off"
              placeholder="noun, verb, phrase…"
              onChange={(event) => {
                setPartOfSpeech(event.target.value);
                clearError();
              }}
            />
          </label>

          <label className="field-block">
            <span>Pronunciation <span className="optional">optional</span></span>
            <input
              className="text-input"
              value={pronunciation}
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              placeholder="phonetic hint"
              onChange={(event) => {
                setPronunciation(event.target.value);
                clearError();
              }}
            />
          </label>

          <label className="field-block is-full">
            <span>Definition in the target language <span className="optional">optional</span></span>
            <textarea
              className="text-input word-editor-textarea is-short"
              value={definitionTarget}
              maxLength={600}
              rows={2}
              onChange={(event) => {
                setDefinitionTarget(event.target.value);
                clearError();
              }}
            />
          </label>

          <label className="field-block is-full">
            <span>Tags <span className="optional">optional</span></span>
            <input
              className="text-input"
              value={tags}
              autoComplete="off"
              placeholder="business, travel, food"
              onChange={(event) => {
                setTags(event.target.value);
                clearError();
              }}
            />
            <span className="field-hint">Separate tags with commas.</span>
          </label>
        </div>

        <p className={cn('word-editor-note', editingBuiltIn && 'is-built-in')} id={noteId}>
          {mode === 'add'
            ? 'The word is saved with your custom words and added to the selected deck.'
            : editingBuiltIn
              ? 'This edits your copy of a built-in word. Study progress stays attached; use Reset to restore the original.'
              : 'Changes are saved with your custom words. Study progress stays attached.'}
        </p>

        {error && (
          <div className="inline-alert is-error word-editor-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="word-editor-actions">
          {mode === 'edit' && canReset && onReset && (
            <button
              type="button"
              className="button button-ghost button-small word-editor-reset"
              onClick={onReset}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset to original
            </button>
          )}
          <button type="button" className="button button-ghost button-small" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button button-primary button-small" disabled={!valid}>
            {mode === 'add' ? 'Add word' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
