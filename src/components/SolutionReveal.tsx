import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  EyeOff,
  Info,
  Languages,
  Loader2,
} from 'lucide-react';
import type { VocabWord } from '../types';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  buildGoogleTranslateUrl,
  translateFree,
} from '../lib/googleTranslate';
import { cn, containsTerm } from '../lib/utils';
import { SpeakerButton } from './ui';

// Auto-reveal can fire one Google Translate request per exercise on a word
// page at once. Sending them through a shared queue keeps the free endpoint
// (and the fallback service) from being hammered in parallel.
let translateQueue: Promise<unknown> = Promise.resolve();

function enqueueTranslate<T>(task: () => Promise<T>): Promise<T> {
  const run = translateQueue.then(task, task);
  translateQueue = run.catch(() => undefined);
  return run;
}

export function SolutionReveal({
  word,
  source,
  exerciseKey,
  compact = false,
}: {
  word: VocabWord;
  source: string;
  exerciseKey: string;
  compact?: boolean;
}) {
  const { settings, progress, setSolution, notify } = useApp();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);

  const native = getLanguage(settings.nativeLanguage);
  const target = getLanguage(settings.targetLanguage);
  const languageKey = `${native.code}>${target.code}`;
  const cacheKey = `${word.id}::${exerciseKey}::${languageKey}`;
  const solution = progress.solutions[cacheKey];
  const solutionUsesTerm = solution ? containsTerm(solution, word.term) : true;
  const translateUrl = buildGoogleTranslateUrl(source, native.code, target.code);

  useEffect(() => {
    setOpen(false);
    setError(null);
    requested.current = false;
    // Language changes re-key the solution cache, so the auto-reveal request
    // must be allowed to run again for the new language pair.
  }, [exerciseKey, word.id, languageKey]);

  useEffect(() => {
    if (copied) {
      const timer = window.setTimeout(() => setCopied(false), 1800);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [copied]);

  /** `enqueued` limits the burst from auto-reveal; direct clicks go straight out. */
  async function reveal(enqueued = false) {
    if (!source.trim()) return;
    if (!settings.googleTranslateEnabled) {
      window.open(translateUrl, '_blank', 'noopener,noreferrer');
      notify('Google Translate opened in a new tab.', 'info');
      return;
    }
    if (solution) {
      setOpen(true);
      setError(null);
      return;
    }
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const fetchTranslation = () => translateFree(source, native.code, target.code);
      const result = enqueued ? await enqueueTranslate(fetchTranslation) : await fetchTranslation();
      setSolution(word.id, `${exerciseKey}::${languageKey}`, result.text);
      setOpen(true);
      if (result.provider === 'mymemory') {
        notify('Google was unreachable, so a fallback translation service was used.', 'info');
      }
    } catch {
      setError(
        "Google Translate couldn't be reached from this browser. Use the direct link below instead.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!settings.autoRevealSolutions || !settings.googleTranslateEnabled) return;
    if (solution) {
      setOpen(true);
      return;
    }
    if (!requested.current && source.trim()) {
      requested.current = true;
      void reveal(true);
    }
    // The effect intentionally runs when the exercise or language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    exerciseKey,
    languageKey,
    settings.autoRevealSolutions,
    settings.googleTranslateEnabled,
    solution,
  ]);

  async function copySolution() {
    if (!solution) return;
    try {
      await navigator.clipboard.writeText(solution);
      setCopied(true);
      notify('Translation copied to clipboard.');
    } catch {
      notify('Could not copy automatically. Select the text to copy it.', 'error');
    }
  }

  return (
    <div className={cn('solution-reveal', compact && 'is-compact')}>
      <div className="solution-actions">
        <button
          type="button"
          className={cn('button button-subtle', open && 'is-open')}
          onClick={() => {
            if (open) setOpen(false);
            else void reveal();
          }}
          disabled={loading || !source.trim()}
        >
          {loading ? (
            <Loader2 size={15} className="spin" aria-hidden="true" />
          ) : open ? (
            <EyeOff size={15} aria-hidden="true" />
          ) : (
            <Languages size={15} aria-hidden="true" />
          )}
          {loading ? 'Translating…' : open ? 'Hide solution' : 'Reveal with Google Translate'}
        </button>

        {(settings.showTranslateLink || error) && (
          <a
            className="button button-ghost button-small"
            href={translateUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this sentence in Google Translate"
          >
            <ExternalLink size={14} aria-hidden="true" />
            Open in Google Translate
          </a>
        )}
      </div>

      {error && (
        <div className="inline-alert is-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {open && solution && (
        <div className="solution-box" aria-live="polite">
          <div className="solution-label">
            <span className="solution-badge">Google Translate</span>
            <span>{target.label}</span>
          </div>
          <p className="solution-text lang-target" lang={target.code}>{solution}</p>
          <div className="solution-tools">
            <SpeakerButton text={solution} lang={target.tts} label={`Hear the ${target.label} solution`} />
            <button
              type="button"
              className="icon-button"
              onClick={() => void copySolution()}
              aria-label="Copy solution"
              title="Copy solution"
            >
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            </button>
          </div>
          {!solutionUsesTerm && (
            <div className="inline-alert is-info">
              <Info size={15} aria-hidden="true" />
              <span>
                This solution does not visibly contain{' '}
                <strong className="lang-target" lang={target.code}>{word.term}</strong>. It may
                use a synonym or a different form, so check that your own answer uses the target
                word.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
