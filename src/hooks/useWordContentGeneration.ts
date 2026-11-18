import { useCallback, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import type { VocabWord } from '../types';
import { generateExamples, generatePracticeSentences, hasAiCredentials } from '../lib/ai';
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

  const wordId = word?.id;
  const canGenerate = settings.aiExercises && hasAiCredentials(settings);
  const existingExamples = wordId ? progress.generatedExamples[wordId] ?? [] : [];
  const existingSentences = wordId ? progress.generatedPractice[wordId] ?? [] : [];

  const generateExamplesFn = useCallback(async () => {
    if (!word || !canGenerate || pending.current.examples) return;
    pending.current.examples = true;
    setGeneratingExamples(true);
    setError(null);
    try {
      const generated = await generateExamples({
        word,
        count: EXAMPLE_COUNT,
        settings,
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
    pending.current.sentences = true;
    setGeneratingSentences(true);
    setError(null);
    try {
      const generated = await generatePracticeSentences({
        word,
        count: Math.max(3, settings.exercisesPerWord),
        settings,
      });
      const fresh = generated.filter((sentence) => !existingSentences.includes(sentence));
      if (fresh.length === 0) {
        notify('The AI returned sentences you already have. Try again for a fresh set.', 'info');
      } else {
        addGeneratedExercises(word.id, [], fresh);
        notify(`Added ${fresh.length} practice ${pluralize(fresh.length, 'sentence')}.`);
      }
    } catch (requestError) {
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
