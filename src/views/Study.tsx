import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Eye,
  Loader2,
  RotateCcw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { VocabWord } from '../types';
import { LEVEL_WORDS, WORD_BY_ID } from '../data/vocabulary';
import { LEVEL_INFO } from '../data/levels';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  cn,
  formatDue,
  formatInterval,
  getStudySentences,
  hashString,
  percent,
  pluralize,
} from '../lib/utils';
import { generatePracticeSentences, hasAiCredentials } from '../lib/ai';
import { speakText } from '../lib/speech';
import {
  AppLink,
  EmptyState,
  LevelBadge,
  PageHeader,
  ProgressRing,
  SpeakerButton,
} from '../components/ui';
import { TranslationExercise } from '../components/TranslationExercise';

function statusForCard(card: { status: string; due: number } | undefined, now: number) {
  if (!card) return { key: 'new', label: 'New word' };
  if (card.due <= now) return { key: 'due', label: 'Due now' };
  if (card.status === 'mastered') return { key: 'mastered', label: 'Mastered' };
  if (card.status === 'learning') return { key: 'learning', label: 'Learning' };
  return { key: 'review', label: 'In review' };
}

export function Study({ level, wordId }: { level: VocabWord['level']; wordId: string }) {
  const {
    settings,
    progress,
    markStudied,
    addGeneratedPractice,
    notify,
    stats,
  } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const word = WORD_BY_ID[wordId];
  const [revealedExamples, setRevealedExamples] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const card = word ? progress.cards[word.id] : undefined;
  const generated = word ? progress.generatedPractice[word.id] ?? [] : [];
  const sentences = useMemo(
    () =>
      word
        ? getStudySentences(word, settings.exercisesPerWord, generated)
        : [],
    [word, settings.exercisesPerWord, generated],
  );

  useEffect(() => {
    if (word && settings.autoplayAudio) {
      speakText(word.term, target.tts, settings.ttsRate);
    }
    // Only auto-play when the word changes, not when other settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id]);

  useEffect(() => {
    setRevealedExamples(new Set());
    setGenerateError(null);
    setJustAdded(false);
  }, [wordId]);

  if (!word) {
    return (
      <div className="view">
        <PageHeader
          eyebrow="Word not found"
          title="That word is not in the deck"
          description="It may have been renamed in src/data/vocabulary.ts, or the link may be out of date."
        />
        <EmptyState
          icon={<BookOpen size={24} />}
          title="Pick another word"
          description="Head back to the level deck to choose a word to study."
          action={
            <AppLink to={{ name: 'level', level }} className="button button-primary">
              Back to {level}
            </AppLink>
          }
        />
      </div>
    );
  }

  const deck = LEVEL_WORDS[word.level] ?? [];
  const index = deck.findIndex((entry) => entry.id === word.id);
  const previous = index > 0 ? deck[index - 1] : undefined;
  const next = index >= 0 && index < deck.length - 1 ? deck[index + 1] : undefined;
  const levelStat = stats.levelStats.find((entry) => entry.level === word.level);
  const status = statusForCard(card, Date.now());
  const filled = sentences.filter((sentence, exerciseIndex) => {
    const answer =
      progress.responses[`${word.id}::study-${exerciseIndex}-${hashString(sentence)}`] ?? '';
    return answer.trim().length > 0;
  }).length;
  const practicePercent = percent(filled, sentences.length);
  const canUseAi = hasAiCredentials(settings);

  async function generateMore() {
    if (!canUseAi) {
      notify('Connect an AI provider in Settings to generate extra practice.', 'info');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generatePracticeSentences({ word, count: 3, settings });
      const fresh = result.filter((sentence) => !sentences.includes(sentence));
      if (fresh.length === 0) {
        notify('The AI returned sentences you already have. Try again for a fresh set.', 'info');
      } else {
        addGeneratedPractice(word.id, fresh);
        notify(`Added ${fresh.length} new AI practice ${pluralize(fresh.length, 'sentence')}.`);
      }
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : 'The AI request failed. Check your provider settings.',
      );
    } finally {
      setGenerating(false);
    }
  }

  function markWord() {
    if (!word) return;
    const added = markStudied(word.id);
    if (added) setJustAdded(true);
  }

  return (
    <div className="view">
      <div className="word-topbar">
        <AppLink to={{ name: 'level', level: word.level }} className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          {word.level} · {LEVEL_INFO[word.level].subtitle}
        </AppLink>
        <div className="word-pager">
          {previous ? (
            <AppLink
              to={{ name: 'word', level: word.level, wordId: previous.id }}
              className="icon-button"
              aria-label={`Previous word: ${previous.term}`}
              title={`Previous: ${previous.term}`}
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </AppLink>
          ) : (
            <span className="icon-button is-disabled" aria-hidden="true">
              <ChevronLeft size={17} />
            </span>
          )}
          <span className="word-pager-count">
            {index + 1} / {deck.length}
          </span>
          {next ? (
            <AppLink
              to={{ name: 'word', level: word.level, wordId: next.id }}
              className="icon-button"
              aria-label={`Next word: ${next.term}`}
              title={`Next: ${next.term}`}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </AppLink>
          ) : (
            <span className="icon-button is-disabled" aria-hidden="true">
              <ChevronRight size={17} />
            </span>
          )}
        </div>
      </div>

      <div className="word-layout">
        <div className="word-main">
          <article className="word-hero">
            <div className="word-hero-glow" aria-hidden="true" />
            <div className="word-hero-top">
              <div className="chip-row">
                <LevelBadge level={word.level} />
                {settings.showPartOfSpeech && word.partOfSpeech && (
                  <span className="chip">{word.partOfSpeech}</span>
                )}
                {(word.tags ?? []).map((tag) => (
                  <span className="chip chip-quiet" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <span className={`status-pill status-${status.key}`}>
                {status.key === 'due' && <span className="status-dot" />}
                {status.label}
              </span>
            </div>

            <div className="word-title-row">
              <h1 className="word-title lang-target" lang={target.code}>{word.term}</h1>
              <SpeakerButton
                text={word.term}
                lang={target.tts}
                label={`Hear ${word.term} in ${target.label}`}
                size={22}
              />
            </div>

            {settings.showPronunciation && word.pronunciation && (
              <p className="word-pronunciation">/{word.pronunciation}/</p>
            )}

            <div className="word-definition-block">
              <span className="definition-label">Meaning · {native.label}</span>
              <p className="word-definition" lang={native.code}>{word.definition}</p>
              {word.definitionTarget && (
                <div className="word-definition-target">
                  <span>{target.label}</span>
                  <p className="lang-target" lang={target.code}>{word.definitionTarget}</p>
                  <SpeakerButton
                    text={word.definitionTarget}
                    lang={target.tts}
                    label="Hear the definition"
                  />
                </div>
              )}
            </div>
          </article>

          <section className="section-card">
            <div className="section-card-head">
              <div>
                <span className="eyebrow">In context</span>
                <h2>Examples</h2>
              </div>
              <span className="section-count">
                {word.examples.length} {pluralize(word.examples.length, 'sentence')}
              </span>
            </div>
            {word.examples.length === 0 ? (
              <p className="muted-copy">No examples yet for this word.</p>
            ) : (
              <div className="example-list">
                {word.examples.map((example, exampleIndex) => {
                  const translationVisible =
                    settings.showExampleTranslations || revealedExamples.has(exampleIndex);
                  return (
                    <div className="example-item" key={`${example.target}-${exampleIndex}`}>
                      <span className="example-index">{String(exampleIndex + 1).padStart(2, '0')}</span>
                      <div className="example-copy">
                        <p className="example-target lang-target" lang={target.code}>{example.target}</p>
                        {translationVisible ? (
                          <p className="example-native" lang={native.code}>
                            <span>{native.label}</span>
                            {example.native}
                          </p>
                        ) : (
                          <button
                            type="button"
                            className="example-reveal"
                            onClick={() =>
                              setRevealedExamples((current) => {
                                const nextSet = new Set(current);
                                nextSet.add(exampleIndex);
                                return nextSet;
                              })
                            }
                          >
                            <Eye size={13} aria-hidden="true" />
                            Show {native.label} translation
                          </button>
                        )}
                      </div>
                      <SpeakerButton
                        text={example.target}
                        lang={target.tts}
                        label={`Hear example ${exampleIndex + 1}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="section-card practice-card">
            <div className="section-card-head practice-head">
              <div>
                <span className="eyebrow">Your turn</span>
                <h2>Translate into {target.label}</h2>
                <p className="practice-intro">
                  Turn each {native.label} sentence into {target.label}. Try to use{' '}
                  <strong className="lang-target" lang={target.code}>{word.term}</strong> naturally in every answer.
                </p>
              </div>
              <div className="practice-head-side">
                <div className="practice-progress">
                  <span>
                    <strong>{filled}</strong>/{sentences.length} drafted
                  </span>
                  <div className="progress-bar is-small">
                    <span style={{ width: `${practicePercent}%` }} />
                  </div>
                </div>
                {settings.aiExercises && (
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => void generateMore()}
                    disabled={generating || !canUseAi}
                    title={
                      canUseAi
                        ? 'Generate three more practice sentences'
                        : 'Connect an AI provider in Settings to generate extra practice'
                    }
                  >
                    {generating ? (
                      <Loader2 size={14} className="spin" aria-hidden="true" />
                    ) : (
                      <Sparkles size={14} aria-hidden="true" />
                    )}
                    {generating ? 'Generating…' : 'More with AI'}
                  </button>
                )}
              </div>
            </div>

            {settings.aiExercises && !canUseAi && (
              <div className="inline-alert is-info">
                <Sparkles size={15} aria-hidden="true" />
                <span>
                  Add a Gemini key or custom OpenAI-compatible endpoint in{' '}
                  <AppLink to={{ name: 'settings' }} className="text-link">
                    Settings
                  </AppLink>{' '}
                  to generate extra exercises and get translation feedback.
                </span>
              </div>
            )}

            {generateError && (
              <div className="inline-alert is-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{generateError}</span>
              </div>
            )}

            {sentences.length === 0 ? (
              <p className="muted-copy">
                Add practice sentences to this word, or generate a set with AI.
              </p>
            ) : (
              <div className="exercise-list">
                {sentences.map((sentence, exerciseIndex) => (
                  <TranslationExercise
                    key={`${word.id}-${exerciseIndex}-${hashString(sentence)}`}
                    word={word}
                    sentence={sentence}
                    index={exerciseIndex}
                    total={sentences.length}
                    exerciseKey={`study-${exerciseIndex}-${hashString(sentence)}`}
                  />
                ))}
              </div>
            )}

            <div className="practice-footer">
              <p>
                <Volume2 size={14} aria-hidden="true" />
                Reveal the Google Translate solution after you have written your own version.
              </p>
              <span>{settings.exercisesPerWord} exercise target</span>
            </div>
          </section>

          <section className={cn('study-finish', card && 'is-added')}>
            <div className="study-finish-copy">
              <span className="eyebrow">Spaced repetition</span>
              <h2>{card ? 'Already in your review queue' : 'Ready to make it stick?'}</h2>
              <p>
                {card
                  ? `Next check-in ${formatDue(card.due)}. You can come back whenever Wordloom surfaces this word again.`
                  : 'Add this word to the queue and Wordloom will space out future reviews automatically.'}
              </p>
            </div>
            <div className="study-finish-actions">
              {card ? (
                <>
                  <span className="status-pill status-review">
                    <Check size={13} aria-hidden="true" />
                    In rotation
                  </span>
                  <AppLink to={{ name: 'review' }} className="button button-primary">
                    Go to review
                    <ArrowRight size={16} aria-hidden="true" />
                  </AppLink>
                </>
              ) : (
                <button type="button" className="button button-primary" onClick={markWord}>
                  Add to review queue
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
              {justAdded && <span className="finish-added">Added — first check-in scheduled</span>}
            </div>
          </section>

          <div className="word-bottom-nav">
            {previous ? (
              <AppLink
                to={{ name: 'word', level: word.level, wordId: previous.id }}
                className="word-bottom-link"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                <span>
                  <small>Previous</small>
                  <strong className="lang-target" lang={target.code}>{previous.term}</strong>
                </span>
              </AppLink>
            ) : (
              <span />
            )}
            {next ? (
              <AppLink
                to={{ name: 'word', level: word.level, wordId: next.id }}
                className="word-bottom-link is-next"
              >
                <span>
                  <small>Next</small>
                  <strong className="lang-target" lang={target.code}>{next.term}</strong>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </AppLink>
            ) : (
              <AppLink to={{ name: 'level', level: word.level }} className="word-bottom-link is-next">
                <span>
                  <small>End of deck</small>
                  <strong>Back to {word.level}</strong>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </AppLink>
            )}
          </div>
        </div>

        <aside className="word-side">
          <div className="side-card">
            <span className="eyebrow">Study status</span>
            <div className="side-status-head">
              <LevelBadge level={word.level} />
              <span className={`status-pill status-${status.key}`}>{status.label}</span>
            </div>
            {card ? (
              <div className="meta-list">
                <div>
                  <span>Next review</span>
                  <strong>{formatDue(card.due)}</strong>
                </div>
                <div>
                  <span>Current interval</span>
                  <strong>{formatInterval(card.interval)}</strong>
                </div>
                <div>
                  <span>Ease</span>
                  <strong>{card.ease.toFixed(2)}</strong>
                </div>
                <div>
                  <span>Reviews</span>
                  <strong>{card.totalReviews}</strong>
                </div>
              </div>
            ) : (
              <p className="side-card-copy">
                Not studied yet. Add it to your queue after working through the exercise sentences.
              </p>
            )}
            <div className="side-progress">
              <div className="side-progress-labels">
                <span>{word.level} deck</span>
                <span>{levelStat?.percent ?? 0}%</span>
              </div>
              <div className="progress-bar is-small">
                <span style={{ width: `${levelStat?.percent ?? 0}%` }} />
              </div>
            </div>
            <AppLink to={{ name: 'level', level: word.level }} className="button button-ghost button-block">
              <BookOpen size={15} aria-hidden="true" />
              View the {word.level} deck
            </AppLink>
          </div>

          <div className="side-card">
            <span className="eyebrow">Make it stick</span>
            <ol className="tip-list">
              <li>
                <span className="tip-icon"><Volume2 size={14} /></span>
                <div>
                  <strong>Say it out loud</strong>
                  <span>Listen, then repeat the word before reading on.</span>
                </div>
              </li>
              <li>
                <span className="tip-icon"><CircleDashed size={14} /></span>
                <div>
                  <strong>Write before revealing</strong>
                  <span>Attempt all five translations before checking Google.</span>
                </div>
              </li>
              <li>
                <span className="tip-icon"><Brain size={14} /></span>
                <div>
                  <strong>Trust the schedule</strong>
                  <span>Reviews appear just before a memory would fade.</span>
                </div>
              </li>
              <li>
                <span className="tip-icon"><RotateCcw size={14} /></span>
                <div>
                  <strong>Return when due</strong>
                  <span>Short, well-timed reviews beat long cramming sessions.</span>
                </div>
              </li>
            </ol>
          </div>

          <div className="side-card side-goal-card">
            <span className="eyebrow">Today</span>
            <div className="side-goal-main">
              <ProgressRing value={percent(stats.practicedToday, settings.dailyGoal)} size={58} stroke={6}>
                <span className="ring-value is-tiny">{stats.practicedToday}</span>
              </ProgressRing>
              <div>
                <strong>
                  {stats.practicedToday} / {settings.dailyGoal}
                </strong>
                <span>practices today</span>
              </div>
            </div>
            <div className="side-goal-note">
              <CalendarClock size={14} aria-hidden="true" />
              <span>{stats.dueNow} {pluralize(stats.dueNow, 'word')} due for review</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
