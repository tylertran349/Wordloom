import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Loader2,
  Sparkles,
} from 'lucide-react';
import type { AiFeedback, VocabWord } from '../types';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import { evaluateTranslation, hasAiCredentials } from '../lib/ai';
import { cn } from '../lib/utils';
import { SpeakerButton } from './ui';
import { SolutionReveal } from './SolutionReveal';

const VERDICT_LABELS: Record<AiFeedback['verdict'], string> = {
  great: 'Excellent',
  close: 'Almost there',
  'needs-work': 'Keep working',
};

function VerdictIcon({ verdict }: { verdict: AiFeedback['verdict'] }) {
  if (verdict === 'great') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (verdict === 'close') return <CircleAlert size={16} aria-hidden="true" />;
  return <CircleX size={16} aria-hidden="true" />;
}

export function TranslationExercise({
  word,
  sentence,
  index,
  exerciseKey,
  total,
  compact = false,
  hideCounter = false,
  onDraftChange,
}: {
  word: VocabWord;
  sentence: string;
  index: number;
  exerciseKey: string;
  total: number;
  compact?: boolean;
  hideCounter?: boolean;
  /** Notified with whether a non-empty answer exists, for session-only counters. */
  onDraftChange?: (drafted: boolean) => void;
}) {
  const { settings, notify } = useApp();
  const native = getLanguage(settings.nativeLanguage);
  const target = getLanguage(settings.targetLanguage);
  const inputId = useId();
  // Typed answers live only in memory for as long as this exercise is shown.
  // They are never auto-populated, saved, or synced anywhere.
  const [answer, setAnswer] = useState('');
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<{ answer: string; data: AiFeedback } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canUseAi = settings.aiFeedback && hasAiCredentials(settings);
  const visibleFeedback = feedback && feedback.answer === answer ? feedback.data : null;
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  useEffect(() => {
    onDraftChangeRef.current?.(answer.trim().length > 0);
  }, [answer]);

  useEffect(
    () => () => {
      onDraftChangeRef.current?.(false);
    },
    [],
  );

  async function checkWithAi() {
    if (!answer.trim()) {
      notify('Write a translation first, then ask for feedback.', 'info');
      return;
    }
    if (!hasAiCredentials(settings)) {
      notify('Add your AI provider details in Settings to use feedback.', 'info');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const result = await evaluateTranslation({
        word,
        source: sentence,
        answer,
        settings,
      });
      setFeedback({ answer, data: result });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The AI check failed. Please try again or check your provider settings.',
      );
    } finally {
      setChecking(false);
    }
  }

  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  return (
    <article className={cn('exercise', compact && 'is-compact')}>
      <div className="exercise-head">
        <span className={cn('exercise-number', hideCounter && 'is-label')}>
          {hideCounter ? 'Review practice' : index + 1}
          {!hideCounter && <span className="exercise-total"> / {total}</span>}
        </span>
        <span className="exercise-source-label">{native.label} → {target.label}</span>
      </div>

      <p className="exercise-sentence" id={`${inputId}-sentence`} lang={native.code}>
        {sentence}
      </p>

      {settings.showExerciseHints && (
        <div className="exercise-hint">
          <span className="exercise-hint-label">Word to use</span>
          <span className="exercise-hint-word lang-target" lang={target.code}>{word.term}</span>
          <span className="exercise-hint-meaning">{word.definition}</span>
        </div>
      )}

      <label className="sr-only" htmlFor={inputId}>
        Your {target.label} translation of sentence {index + 1}
      </label>
      <textarea
        id={inputId}
        className="exercise-input lang-target"
        lang={target.code}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder={`Write your ${target.label} translation…`}
        rows={compact ? 2 : 3}
        aria-describedby={`${inputId}-sentence`}
        spellCheck
        autoCapitalize="sentences"
      />
      <div className="exercise-meta">
        <span>
          {wordCount > 0
            ? `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`
            : 'Answers stay on this screen and are never saved'}
        </span>
      </div>

      <div className="exercise-actions">
        <SolutionReveal word={word} source={sentence} exerciseKey={exerciseKey} compact={compact} />
        {settings.aiFeedback && canUseAi && (
          <button
            type="button"
            className="button button-ghost button-small"
            onClick={() => void checkWithAi()}
            disabled={checking}
            title={`Ask ${settings.aiProvider === 'gemini' ? 'Gemini' : 'your AI provider'} for feedback`}
          >
            {checking ? (
              <Loader2 size={14} className="spin" aria-hidden="true" />
            ) : (
              <Sparkles size={14} aria-hidden="true" />
            )}
            {checking ? 'Checking…' : 'Check with AI'}
          </button>
        )}
      </div>

      {error && (
        <div className="inline-alert is-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {visibleFeedback && (
        <div
          className={cn('ai-feedback', `verdict-${visibleFeedback.verdict}`)}
          aria-live="polite"
        >
          <div className="ai-feedback-head">
            <span className="ai-feedback-verdict">
              <VerdictIcon verdict={visibleFeedback.verdict} />
              {VERDICT_LABELS[visibleFeedback.verdict]}
            </span>
            <span className="ai-feedback-source">
              <Sparkles size={12} aria-hidden="true" /> AI feedback
            </span>
          </div>
          <p lang={native.code}>{visibleFeedback.feedback}</p>
          {visibleFeedback.suggestion && (
            <div className="ai-suggestion">
              <span className="ai-suggestion-label">Suggested {target.label}</span>
              <p className="lang-target" lang={target.code}>{visibleFeedback.suggestion}</p>
              <SpeakerButton
                text={visibleFeedback.suggestion}
                lang={target.tts}
                label="Hear the suggested translation"
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
