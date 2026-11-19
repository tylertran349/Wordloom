import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { VocabWord } from '../types';
import {
  generateExamples as requestExamples,
  generatePracticeSentences as requestPracticeSentences,
  hasAiCredentials,
  isCancelledRequest,
} from '../lib/ai';
import { pluralize } from '../lib/utils';

type GenerationKind = 'examples' | 'sentences';

/**
 * Everything that differs between the two content types, fully typed so the
 * shared runner below needs no casts. Each call site builds a plan whose item
 * type is concrete, so `T` is always inferred cleanly.
 */
interface GenerationPlan<T> {
  kind: GenerationKind;
  /** Ask the model for a fresh batch. */
  run: (signal: AbortSignal) => Promise<T[]>;
  /** Drop anything the learner already has. */
  fresh: (generated: T[]) => T[];
  /** Store the batch in progress. */
  save: (fresh: T[]) => void;
  noneMessage: string;
  addedMessage: (count: number) => string;
}

export interface WordContentGeneration {
  canGenerate: boolean;
  generatingExamples: boolean;
  generatingSentences: boolean;
  error: string | null;
  generateExamples: () => Promise<void>;
  generateSentences: () => Promise<void>;
  dismissError: () => void;
}

/**
 * Shared AI generation logic for every view that shows examples or sentence
 * exercises. Examples and exercises are generated in separate requests so the
 * two buttons can be used independently.
 */
export function useWordContentGeneration(word: VocabWord | undefined): WordContentGeneration {
  const { settings, progress, addGeneratedExercises, notify } = useApp();
  const [generatingExamples, setGeneratingExamples] = useState(false);
  const [generatingSentences, setGeneratingSentences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef({ examples: false, sentences: false });
  // Navigating away cancels in-flight requests so a slow response can neither
  // write into progress for a word the learner left nor raise a stale toast.
  const examplesAbort = useRef<AbortController | null>(null);
  const sentencesAbort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      examplesAbort.current?.abort();
      sentencesAbort.current?.abort();
    },
    [],
  );

  const wordId = word?.id;
  const canGenerate = settings.aiExercises && hasAiCredentials(settings);
  const existingExamples = wordId ? progress.generatedExamples[wordId] ?? [] : [];
  const existingSentences = wordId ? progress.generatedPractice[wordId] ?? [] : [];

  const generateBatch = useCallback(
    async <T,>(plan: GenerationPlan<T>): Promise<void> => {
      if (!word || !canGenerate || pending.current[plan.kind]) return;
      const abort = new AbortController();
      if (plan.kind === 'examples') {
        examplesAbort.current = abort;
        setGeneratingExamples(true);
      } else {
        sentencesAbort.current = abort;
        setGeneratingSentences(true);
      }
      pending.current[plan.kind] = true;
      setError(null);
      try {
        const fresh = plan.fresh(await plan.run(abort.signal));
        if (fresh.length === 0) {
          notify(plan.noneMessage, 'info');
        } else {
          plan.save(fresh);
          notify(plan.addedMessage(fresh.length));
        }
      } catch (requestError) {
        if (isCancelledRequest(requestError)) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'The AI request failed. Check your provider settings.',
        );
      } finally {
        pending.current[plan.kind] = false;
        if (plan.kind === 'examples') setGeneratingExamples(false);
        else setGeneratingSentences(false);
      }
    },
    [word, canGenerate, notify],
  );

  const generateExamplesFn = useCallback(
    async () => {
      if (!word) return;
      await generateBatch({
        kind: 'examples',
        // No count: the model returns one sentence per distinct use, so the
        // learner sees every common way to apply the word.
        run: (signal) => requestExamples({ word, settings, signal }),
        fresh: (generated) => {
          const known = new Set(
            existingExamples.map((example) => example.target.trim().toLowerCase()),
          );
          return generated.filter((example) => {
            const key = example.target.trim().toLowerCase();
            if (!key || known.has(key)) return false;
            known.add(key);
            return true;
          });
        },
        save: (fresh) => addGeneratedExercises(word.id, fresh, []),
        noneMessage: 'No new examples — the model returned sentences you already have.',
        addedMessage: (count) => `Added ${count} example ${pluralize(count, 'sentence')}.`,
      });
    },
    [generateBatch, word, settings, existingExamples, addGeneratedExercises],
  );

  const generateSentencesFn = useCallback(
    async () => {
      if (!word) return;
      await generateBatch({
        kind: 'sentences',
        run: (signal) =>
          requestPracticeSentences({
            word,
            count: Math.max(3, settings.exercisesPerWord),
            settings,
            signal,
          }),
        fresh: (generated) =>
          generated.filter((sentence) => !existingSentences.includes(sentence)),
        save: (fresh) => addGeneratedExercises(word.id, [], fresh),
        noneMessage: 'The AI returned sentences you already have. Try again for a fresh set.',
        addedMessage: (count) => `Added ${count} practice ${pluralize(count, 'sentence')}.`,
      });
    },
    [generateBatch, word, settings, existingSentences, addGeneratedExercises],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    canGenerate,
    generatingExamples,
    generatingSentences,
    error,
    generateExamples: generateExamplesFn,
    generateSentences: generateSentencesFn,
    dismissError,
  };
}
