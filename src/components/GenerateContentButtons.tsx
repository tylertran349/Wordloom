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
}

/**
 * The two independent AI actions shown wherever examples or practice
 * sentences appear. Generating examples never creates exercises, and
 * generating exercises never creates examples.
 */
export function GenerateContentButtons({
  onGenerateExamples,
  onGenerateSentences,
  generatingExamples = false,
  generatingSentences = false,
  disabled = false,
  small = false,
  className,
}: GenerateContentButtonsProps) {
  return (
    <div className={cn('generate-buttons', small && 'is-small', className)}>
      <button
        type="button"
        className={cn('button button-ghost', small && 'button-small')}
        onClick={onGenerateExamples}
        disabled={disabled || generatingExamples}
        title="Generate example sentences only with AI"
      >
        {generatingExamples ? (
          <Loader2 size={14} className="spin" aria-hidden="true" />
        ) : (
          <Sparkles size={14} aria-hidden="true" />
        )}
        {generatingExamples ? 'Generating examples…' : 'Generate examples'}
      </button>
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
    </div>
  );
}
