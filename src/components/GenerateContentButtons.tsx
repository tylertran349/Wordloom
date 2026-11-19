import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface GenerateContentButtonsProps {
  onGenerateExamples: () => void;
  onGenerateSentences: () => void;
  generatingExamples?: boolean;
  generatingSentences?: boolean;
  disabled?: boolean;
  small?: boolean;
  className?: string;
  showGenerateExamples?: boolean;
  showGenerateExercises?: boolean;
}

/**
 * The independent AI actions shown wherever examples or practice sentences
 * appear. Generating examples never creates exercises, and generating
 * exercises never creates examples. Each button can be hidden individually
 * with the showGenerateExamples / showGenerateExercises props.
 */
export function GenerateContentButtons({
  onGenerateExamples,
  onGenerateSentences,
  generatingExamples = false,
  generatingSentences = false,
  disabled = false,
  small = false,
  className,
  showGenerateExamples = true,
  showGenerateExercises = true,
}: GenerateContentButtonsProps) {
  return (
    <div className={cn('generate-buttons', small && 'is-small', className)}>
      {showGenerateExamples && (
        <button
          type="button"
          className={cn('button button-ghost', small && 'button-small')}
          onClick={onGenerateExamples}
          disabled={disabled || generatingExamples}
          title="Generate example sentences covering every use of the word"
        >
          {generatingExamples ? (
            <Loader2 size={14} className="spin" aria-hidden="true" />
          ) : (
            <Sparkles size={14} aria-hidden="true" />
          )}
          {generatingExamples ? 'Generating examples…' : 'Generate examples'}
        </button>
      )}
      {showGenerateExercises && (
        <button
          type="button"
          className={cn('button button-ghost', small && 'button-small')}
          onClick={onGenerateSentences}
          disabled={disabled || generatingSentences}
          title="Generate sentence exercises only with AI"
        >
          {generatingSentences ? (
            <Loader2 size={14} className="spin" aria-hidden="true" />
          ) : (
            <Sparkles size={14} aria-hidden="true" />
          )}
          {generatingSentences ? 'Generating exercises…' : 'Generate exercises'}
        </button>
      )}
    </div>
  );
}
