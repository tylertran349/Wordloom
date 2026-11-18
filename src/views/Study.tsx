import { useCallback, useEffect, useMemo, useState } from 'react';
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
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { VocabWord } from '../types';
import { LEVEL_WORDS, WORD_BY_ID } from '../data/vocabulary';
import { LEVEL_INFO } from '../data/levels';
import { navigate } from '../lib/router';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  cn,
  formatDue,
  formatInterval,
  getStudySentences,
  hashString,
  percent,
  pickNextNewWord,
  pluralize,
} from '../lib/utils';
import { speakText } from '../lib/speech';
import { useWordContentGeneration } from '../hooks/useWordContentGeneration';
import {
  AppLink,
  ConfirmDialog,
  EmptyState,
  LevelBadge,
  PageHeader,
  ProgressRing,
  SpeakerButton,
} from '../components/ui';
import { GenerateContentButtons } from '../components/GenerateContentButtons';
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
    removeStudied,
    stats,
    recordLevelPosition,
    markSeen,
    levelDecks,
  } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const word = WORD_BY_ID[wordId];
  const deck = word ? levelDecks[word.level] ?? [] : [];
  const index = word ? deck.findIndex((entry) => entry.id === word.id) : -1;
  const {
    canGenerate,
    generatingExamples,
    generatingSentences,
    error: generateError,
    generateExamples,
    generateSentences,
    autoGenerateExamples,
    dismissError,
  } = useWordContentGeneration(word);
  const [revealedExamples, setRevealedExamples] = useState<Set<number>>(new Set());
  const [justAdded, setJustAdded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [jumpValue, setJumpValue] = useState(() => String(index + 1));
  // Session-only record of which exercises have a typed answer. Typed
  // answers are never persisted, so this lives and dies with the page.
  const [draftedKeys, setDraftedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const reportDraft = useCallback((key: string, drafted: boolean) => {
    setDraftedKeys((current) => {
      const has = current.has(key);
      if (drafted === has) return current;
      const next = new Set(current);
      if (drafted) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const card = word ? progress.cards[word.id] : undefined;
  const generated = word ? progress.generatedPractice[word.id] ?? [] : [];
  const examples = word ? progress.generatedExamples[word.id] ?? [] : [];
  const sentences = useMemo(() => getStudySentences(generated), [generated]);
  // With a randomized study order, every "next" navigation picks a fresh
  // random unstudied word instead of following the fixed deck sequence.
  const randomNext = useMemo(() => {
    if (settings.newWordOrder !== 'random' || !word) return undefined;
    return pickNextNewWord(
      deck,
      'random',
      progress.cards,
      progress.seenWords,
      word.id,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id, settings.newWordOrder, deck, progress.cards, progress.seenWords]);

  useEffect(() => {
    if (word && settings.autoplayAudio) {
      void speakText(word.term, target.tts, settings.ttsRate, settings.ttsProvider);
    }
    // Only auto-play when the word changes, not when other settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id]);

  useEffect(() => {
    setRevealedExamples(new Set());
    dismissError();
    setJustAdded(false);
    setConfirmRemove(false);
  }, [wordId, dismissError]);

  useEffect(() => {
    setJumpValue(String(index + 1));
  }, [index, wordId]);

  // Opening a word page counts as seeing it. Seen words that the learner
  // never adds to the queue are not offered as new words again.
  useEffect(() => {
    if (!word) return;
    markSeen(word.id);
  }, [word?.id, markSeen]);

  // A newly studied word gets its example sentences automatically. The hook
  // attempts this once per word and only when no examples are saved yet.
  useEffect(() => {
    autoGenerateExamples();
  }, [autoGenerateExamples]);

  // Remember where the learner stopped, per CEFR deck. Positions are stored in
  // vocabulary-file order so a randomized study order does not invalidate them.
  useEffect(() => {
    if (!word) return;
    const levelDeck = LEVEL_WORDS[word.level] ?? [];
    recordLevelPosition(
      word.level,
      levelDeck.findIndex((entry) => entry.id === word.id),
    );
    // Only record when the opened word changes, not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.id, recordLevelPosition]);

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

  const previous = index > 0 ? deck[index - 1] : undefined;
  const positionalNext = index >= 0 && index < deck.length - 1 ? deck[index + 1] : undefined;
  const next = settings.newWordOrder === 'random' ? randomNext ?? positionalNext : positionalNext;
  const levelStat = stats.levelStats.find((entry) => entry.level === word.level);
  const status = statusForCard(card, Date.now());
  const filled = sentences.filter((sentence, exerciseIndex) =>
    draftedKeys.has(`${word.id}:study-${exerciseIndex}-${hashString(sentence)}`),
  ).length;
  const practicePercent = percent(filled, sentences.length);

  function markWord() {
    if (!word) return;
    const added = markStudied(word.id);
    if (added) setJustAdded(true);
  }

  function jumpToCard() {
    if (!word || deck.length === 0) return;
    const parsed = Number.parseInt(jumpValue, 10);
    if (!Number.isFinite(parsed)) {
      setJumpValue(String(index + 1));
      return;
    }
    const targetIndex = Math.min(Math.max(parsed, 1), deck.length) - 1;
    if (targetIndex === index) {
      setJumpValue(String(index + 1));
      return;
    }
    navigate({ name: 'word', level: word.level, wordId: deck[targetIndex].id });
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
          <form
            className="word-pager-jump"
            aria-label="Jump to card"
            onSubmit={(event) => {
              event.preventDefault();
              jumpToCard();
            }}
          >
            <label className="sr-only" htmlFor="word-pager-input">
              Card number (1 to {deck.length})
            </label>
            <input
              id="word-pager-input"
              className="word-pager-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              spellCheck={false}
              value={jumpValue}
              onChange={(event) => setJumpValue(event.target.value.replace(/\D/g, ''))}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => setJumpValue(String(index + 1))}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setJumpValue(String(index + 1));
                  event.currentTarget.blur();
                }
              }}
              title="Type a card number and press Enter to jump"
            />
            <span className="word-pager-total">/ {deck.length}</span>
          </form>
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
              <div className="section-head-actions">
                <span className="section-count">
                  {examples.length} {pluralize(examples.length, 'sentence')}
                </span>
                {canGenerate && (
                  <GenerateContentButtons
                    small
                    className="is-end"
                    onGenerateExamples={() => void generateExamples()}
                    onGenerateSentences={() => void generateSentences()}
                    generatingExamples={generatingExamples}
                    generatingSentences={generatingSentences}
                  />
                )}
              </div>
            </div>
            {examples.length === 0 ? (
              <div className="examples-empty">
                <p className="muted-copy">
                  {canGenerate
                    ? 'New words get examples automatically. Use the buttons above to generate more.'
                    : 'Examples are generated with AI once you connect a provider in Settings.'}
                </p>
              </div>
            ) : (
              <div className="example-list">
                {examples.map((example, exampleIndex) => {
                  const translationVisible =
                    settings.showExampleTranslations || revealedExamples.has(exampleIndex);
                  return (
                    <div className="example-item" key={`${example.target}-${exampleIndex}`}>
                      <span className="example-index">{String(exampleIndex + 1).padStart(2, '0')}</span>
                      <div className="example-copy">
                        <p className="example-target lang-target" lang={target.code}>{example.target}</p>
                        {!example.native ? null : translationVisible ? (
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
                {canGenerate && (
                  <GenerateContentButtons
                    small
                    className="is-end"
                    onGenerateExamples={() => void generateExamples()}
                    onGenerateSentences={() => void generateSentences()}
                    generatingExamples={generatingExamples}
                    generatingSentences={generatingSentences}
                  />
                )}
              </div>
            </div>

            {settings.aiExercises && !canGenerate && (
              <div className="inline-alert is-info">
                <Sparkles size={15} aria-hidden="true" />
                <span>
                  Add a Gemini key or custom OpenAI-compatible endpoint in{' '}
                  <AppLink to={{ name: 'settings' }} className="text-link">
                    Settings
                  </AppLink>{' '}
                  to generate example sentences and exercises, and get translation feedback.
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
                {canGenerate
                  ? 'Generate a set of AI practice sentences to start translating.'
                  : 'Practice sentences are generated with AI. Connect a provider in Settings to get started.'}
              </p>
            ) : (
              <div className="exercise-list">
                {sentences.map((sentence, exerciseIndex) => {
                  const draftKey = `${word.id}:study-${exerciseIndex}-${hashString(sentence)}`;
                  return (
                    <TranslationExercise
                      key={`${word.id}-${exerciseIndex}-${hashString(sentence)}`}
                      word={word}
                      sentence={sentence}
                      index={exerciseIndex}
                      total={sentences.length}
                      exerciseKey={`study-${exerciseIndex}-${hashString(sentence)}`}
                      onDraftChange={(drafted) => reportDraft(draftKey, drafted)}
                    />
                  );
                })}
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
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Remove from queue
                  </button>
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
            {card && (
              <button
                type="button"
                className="text-link side-remove-link"
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 size={13} aria-hidden="true" />
                Remove from review queue
              </button>
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

      {confirmRemove && card && (
        <ConfirmDialog
          title="Remove this word from the review queue?"
          description={
            <p>
              “{word.term}” will stop appearing in reviews and its schedule will be cleared. Your
              generated examples are kept, and you can add it to the queue again at any time.
            </p>
          }
          confirmLabel="Yes, remove it"
          cancelLabel="Keep it"
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            removeStudied(word.id);
          }}
        />
      )}
    </div>
  );
}
