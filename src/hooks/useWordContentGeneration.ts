import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { VocabWord } from '../types';
import {
  generateExamples,
  generatePracticeSentences,
  hasAiCredentials,
  isCancelledRequest,
} from '../lib/ai';
import { pluralize } from '../lib/utils';

const EXAMPLE_COUNT = 2;

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

  const generateExamplesFn = useCallback(async () => {
    if (!word || !canGenerate || pending.current.examples) return;
    const abort = new AbortController();
    examplesAbort.current = abort;
    pending.current.examples = true;
    setGeneratingExamples(true);
    setError(null);
    try {
      const generated = await generateExamples({
        word,
        count: EXAMPLE_COUNT,
        settings,
        signal: abort.signal,
      });
      const known = new Set(existingExamples.map((example) => example.target.trim().toLowerCase()));
      const fresh = generated.filter((example) => {
        const key = example.target.trim().toLowerCase();
        if (!key || known.has(key)) return false;
        known.add(key);
        return true;
      });
      if (fresh.length === 0) {
        notify('The AI returned examples you already have. Try again for a fresh set.', 'info');
      } else {
        addGeneratedExercises(word.id, fresh, []);
        notify(`Added ${fresh.length} example ${pluralize(fresh.length, 'sentence')}.`);
      }
    } catch (requestError) {
      if (isCancelledRequest(requestError)) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The AI request failed. Check your provider settings.',
      );
    } finally {
      pending.current.examples = false;
      setGeneratingExamples(false);
    }
  }, [word, canGenerate, settings, existingExamples, addGeneratedExercises, notify]);

  const generateSentencesFn = useCallback(async () => {
    if (!word || !canGenerate || pending.current.sentences) return;
    const abort = new AbortController();
    sentencesAbort.current = abort;
    pending.current.sentences = true;
    setGeneratingSentences(true);
    setError(null);
    try {
      const generated = await generatePracticeSentences({
        word,
        count: Math.max(3, settings.exercisesPerWord),
        settings,
        signal: abort.signal,
      });
      const fresh = generated.filter((sentence) => !existingSentences.includes(sentence));
      if (fresh.length === 0) {
        notify('The AI returned sentences you already have. Try again for a fresh set.', 'info');
      } else {
        addGeneratedExercises(word.id, [], fresh);
        notify(`Added ${fresh.length} practice ${pluralize(fresh.length, 'sentence')}.`);
      }
    } catch (requestError) {
      if (isCancelledRequest(requestError)) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The AI request failed. Check your provider settings.',
      );
    } finally {
      pending.current.sentences = false;
      setGeneratingSentences(false);
    }
  }, [word, canGenerate, settings, existingSentences, addGeneratedExercises, notify]);

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
