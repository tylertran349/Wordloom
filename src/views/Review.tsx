import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Flame,
  RotateCcw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { ReviewGrade, VocabWord } from '../types';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  cn,
  formatDue,
  formatInterval,
  getPracticeSentences,
  hashString,
  percent,
  pluralize,
} from '../lib/utils';
import {
  createCard,
  previewGradeIntervals,
} from '../lib/srs';
import {
  AppLink,
  EmptyState,
  LevelBadge,
  PageHeader,
  ProgressRing,
  SpeakerButton,
} from '../components/ui';
import { TranslationExercise } from '../components/TranslationExercise';

const GRADES: Array<{ grade: ReviewGrade; label: string; key: string }> = [
  { grade: 'again', label: 'Again', key: '1' },
  { grade: 'hard', label: 'Hard', key: '2' },
  { grade: 'good', label: 'Good', key: '3' },
  { grade: 'easy', label: 'Easy', key: '4' },
];

type GradeCounts = Record<ReviewGrade, number>;

interface SessionSummary {
  counts: GradeCounts;
  total: number;
}

const emptyCounts: GradeCounts = { again: 0, hard: 0, good: 0, easy: 0 };

export function Review({ practice = false }: { practice?: boolean }) {
  const {
    settings,
    progress,
    dueWords,
    studiedWords,
    gradeCard,
    stats,
  } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const initialQueue = useMemo(
    () =>
      (dueWords.length > 0 ? dueWords : practice ? studiedWords : []).slice(
        0,
        settings.maxReviewsPerDay,
      ),
    // The queue is intentionally built once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [queue, setQueue] = useState<VocabWord[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState<GradeCounts>(emptyCounts);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const gradeLock = useRef(false);
  const termRef = useRef<HTMLHeadingElement>(null);

  const current = queue[index];
  const currentCard = current ? progress.cards[current.id] : undefined;
  const now = Date.now();
  const previewCard = currentCard ?? (current ? createCard(current.id, {
    startingEase: settings.startingEase,
    easyBonus: settings.easyBonus,
    hardMultiplier: settings.hardMultiplier,
    maxIntervalDays: settings.maxIntervalDays,
    learningStepMinutes: settings.learningStepMinutes,
  }, now) : undefined);
  const previews = previewCard
    ? previewGradeIntervals(previewCard, {
        startingEase: settings.startingEase,
        easyBonus: settings.easyBonus,
        hardMultiplier: settings.hardMultiplier,
        maxIntervalDays: settings.maxIntervalDays,
        learningStepMinutes: settings.learningStepMinutes,
      }, now)
    : null;

  const exercise = useMemo(() => {
    if (!current || !settings.reviewExercise) return null;
    const sentences = getPracticeSentences(
      Math.max(20, settings.exercisesPerWord),
      progress.generatedPractice[current.id] ?? [],
    );
    if (sentences.length === 0) return null;
    const sentenceIndex =
      (hashString(current.id) + (currentCard?.totalReviews ?? 0)) % sentences.length;
    return { sentence: sentences[sentenceIndex], index: sentenceIndex };
  }, [
    current,
    currentCard?.totalReviews,
    settings.reviewExercise,
    settings.exercisesPerWord,
    progress.generatedPractice,
  ]);

  const reviewExample = current ? progress.generatedExamples[current.id]?.[0] : undefined;

  function startSession(words: VocabWord[]) {
    setQueue(words.slice(0, settings.maxReviewsPerDay));
    setIndex(0);
    setRevealed(false);
    setCounts(emptyCounts);
    setSummary(null);
    window.scrollTo({ top: 0, behavior: settings.reduceMotion ? 'auto' : 'smooth' });
  }

  function handleGrade(grade: ReviewGrade) {
    if (!current || gradeLock.current) return;
    gradeLock.current = true;
    gradeCard(current.id, grade);
    const nextCounts = { ...counts, [grade]: counts[grade] + 1 };
    setCounts(nextCounts);
    if (index >= queue.length - 1) {
      setSummary({ counts: nextCounts, total: queue.length });
    } else {
      setIndex((value) => value + 1);
      setRevealed(false);
      window.scrollTo({ top: 0, behavior: settings.reduceMotion ? 'auto' : 'smooth' });
    }
    window.setTimeout(() => {
      gradeLock.current = false;
    }, 260);
  }

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      termRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [current?.id]);

  useEffect(() => {
    const restart = () => {
      startSession(dueWords.length > 0 ? dueWords : studiedWords);
    };
    window.addEventListener('wordloom:restart-review', restart);
    return () => window.removeEventListener('wordloom:restart-review', restart);
    // startSession is intentionally re-created with the latest queue sources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueWords, studiedWords, settings.maxReviewsPerDay]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const targetElement = event.target as HTMLElement | null;
      if (
        targetElement?.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      ) {
        return;
      }
      if (summary) return;
      if (event.code === 'Space' && !revealed && current) {
        if (targetElement?.closest('button, a')) return;
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed) {
        const grade = GRADES.find((entry) => entry.key === event.key)?.grade;
        if (grade) {
          event.preventDefault();
          handleGrade(grade);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Rebind when the visible card or reveal state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, current?.id, index, summary, counts]);

  const strongCount = summary ? summary.counts.good + summary.counts.easy : 0;
  const strongPercent = summary ? percent(strongCount, summary.total) : 0;

  if (queue.length === 0) {
    return (
      <div className="view review-view">
        <PageHeader
          eyebrow="Spaced repetition"
          title="Review session"
          description="A short, well-timed recall session. Wordloom queues words you have studied when their next check-in is due."
        />
        {studiedWords.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={26} />}
            title="No words in rotation yet"
            description="Study a word and add it to your queue. It will appear here when it is next due for review."
            action={
              <AppLink to={{ name: 'level', level: 'A1' }} className="button button-primary">
                Browse A1 vocabulary
                <ArrowRight size={16} aria-hidden="true" />
              </AppLink>
            }
          />
        ) : (
          <EmptyState
            icon={dueWords.length > 0 ? <RotateCcw size={26} /> : <Check size={26} />}
            title={dueWords.length > 0 ? 'Reviews are ready' : 'Nothing is due right now'}
            description={
              dueWords.length > 0
                ? `${dueWords.length} ${pluralize(
                    dueWords.length,
                    'word',
                  )} just became due. Pick up where you left off.`
                : `You have ${studiedWords.length} ${pluralize(
                    studiedWords.length,
                    'word',
                  )} in rotation.${
                    stats.nextDue ? ` The next review is ${formatDue(stats.nextDue)}.` : ''
                  }`
            }
            action={
              <div className="empty-button-row">
                {dueWords.length > 0 ? (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => startSession(dueWords)}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Start review
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => startSession(studiedWords)}
                  >
                    <RotateCcw size={15} aria-hidden="true" />
                    Practice anyway
                  </button>
                )}
                <AppLink to={{ name: 'level', level: 'A1' }} className="button button-ghost">
                  Study new words
                </AppLink>
              </div>
            }
          />
        )}
      </div>
    );
  }

  if (summary) {
    return (
      <div className="view review-view">
        <PageHeader
          eyebrow="Spaced repetition"
          title="Session complete"
          description="Every review you finish makes the next check-in a little farther away."
          actions={
            <span className="streak-pill">
              <Flame size={16} aria-hidden="true" />
              <strong>{stats.streak}</strong>
              <span>day streak</span>
            </span>
          }
        />
        <section className="review-summary">
          <div className="review-summary-hero">
            <div className="summary-icon">
              <Trophy size={28} aria-hidden="true" />
            </div>
            <div>
              <span className="eyebrow">Session summary</span>
              <h2>
                {summary.total} {pluralize(summary.total, 'word')} reviewed
              </h2>
              <p>
                {strongPercent >= 75
                  ? 'Strong recall. Those intervals are stretching out nicely.'
                  : strongPercent >= 40
                    ? 'A solid session. The words you struggled with will return sooner.'
                    : 'Good work showing up. Repeated exposure is exactly what moves words into memory.'}
              </p>
            </div>
            <ProgressRing
              value={strongPercent}
              size={118}
              stroke={10}
              label={`${strongPercent}% strong recall`}
            >
              <span className="ring-value">{strongPercent}%</span>
              <span className="ring-caption">strong recall</span>
            </ProgressRing>
          </div>

          <div className="summary-grades">
            {GRADES.map((entry) => (
              <div key={entry.grade} className={cn('summary-grade', `grade-${entry.grade}`)}>
                <span>{entry.label}</span>
                <strong>{summary.counts[entry.grade]}</strong>
              </div>
            ))}
          </div>

          <div className="review-summary-actions">
            <AppLink to={{ name: 'dashboard' }} className="button button-primary">
              Back to today
            </AppLink>
            {studiedWords.length > 0 && (
              <button
                type="button"
                className="button button-ghost"
                onClick={() =>
                  startSession(dueWords.length > 0 ? dueWords : studiedWords)
                }
              >
                <RotateCcw size={15} aria-hidden="true" />
                {dueWords.length > 0
                  ? `Review ${Math.min(dueWords.length, settings.maxReviewsPerDay)} more`
                  : 'Extra practice'}
              </button>
            )}
            <AppLink to={{ name: 'level', level: 'A1' }} className="button button-ghost">
              Study new words
            </AppLink>
          </div>

          <div className="summary-footnote">
            <Sparkles size={14} aria-hidden="true" />
            Your schedule has been saved to this device.
          </div>
        </section>
      </div>
    );
  }

  if (!current) return null;

  const card = currentCard;
  const exerciseKey = exercise ? `review-${hashString(exercise.sentence)}` : 'review';

  return (
    <div className="view review-view">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Recall before you reveal"
        description="Give the answer a genuine attempt first. The grade you choose determines when this word comes back."
        actions={
          <AppLink to={{ name: 'dashboard' }} className="button button-ghost">
            End session
          </AppLink>
        }
      />

      <div className="review-shell">
        <div className="review-session-bar">
          <span className="review-session-label">
            Card <strong>{index + 1}</strong> of {queue.length}
          </span>
          <div className="progress-bar">
            <span style={{ width: `${percent(index + (revealed ? 0.4 : 0), queue.length)}%` }} />
          </div>
          <span className="review-streak">
            <Flame size={14} aria-hidden="true" />
            {stats.streak} day streak
          </span>
        </div>

        <article className="review-card">
          <div className="review-card-head">
            <div className="chip-row">
              <LevelBadge level={current.level} />
              {settings.showPartOfSpeech && current.partOfSpeech && (
                <span className="chip chip-quiet">{current.partOfSpeech}</span>
              )}
            </div>
            <span className="review-card-meta">
              {target.label} → {native.label}
            </span>
          </div>

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {revealed ? `Answer revealed. ${current.definition}` : ''}
          </div>

          <div className="review-front">
            <h2
              className="review-term lang-target"
              ref={termRef}
              tabIndex={-1}
              lang={target.code}
            >
              {current.term}
            </h2>
            <div className="review-pronunciation">
              {settings.showPronunciation && current.pronunciation && (
                <span>/{current.pronunciation}/</span>
              )}
              <SpeakerButton
                text={current.term}
                lang={target.tts}
                label={`Hear ${current.term}`}
                size={18}
              />
            </div>
            {!revealed && (
              <p className="review-prompt">
                What does this word mean?<br />
                <span>Say the meaning and a sentence out loud.</span>
              </p>
            )}
          </div>

          {!revealed ? (
            <div className="review-reveal-area">
              <button
                type="button"
                className="button button-primary button-wide"
                onClick={() => setRevealed(true)}
              >
                Show answer
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <span className="keyboard-hint">
                Press <kbd>Space</kbd> to reveal
              </span>
            </div>
          ) : (
            <div className="review-answer">
              <div className="review-definition">
                <span className="definition-label">Meaning · {native.label}</span>
                <p lang={native.code}>{current.definition}</p>
                {current.definitionTarget && (
                  <p className="review-definition-target lang-target" lang={target.code}>{current.definitionTarget}</p>
                )}
              </div>

              {settings.reviewShowExample && reviewExample && (
                <div className="review-example">
                  <span className="definition-label">Example</span>
                  <div className="review-example-row">
                    <p className="lang-target" lang={target.code}>{reviewExample.target}</p>
                    <SpeakerButton
                      text={reviewExample.target}
                      lang={target.tts}
                      label="Hear the example"
                    />
                  </div>
                  {settings.showExampleTranslations && reviewExample.native && (
                    <p className="review-example-native" lang={native.code}>{reviewExample.native}</p>
                  )}
                </div>
              )}

              {exercise && (
                <div className="review-exercise">
                  <div className="review-exercise-head">
                    <span className="definition-label">Quick production practice</span>
                    <span>Optional output before grading</span>
                  </div>
                  <TranslationExercise
                    key={`${current.id}-${exerciseKey}`}
                    word={current}
                    sentence={exercise.sentence}
                    index={0}
                    total={1}
                    exerciseKey={exerciseKey}
                    compact
                    hideCounter
                  />
                </div>
              )}

              <div className="review-grade">
                <div className="review-grade-head">
                  <h2>How well did you recall it?</h2>
                  <span>Your choice sets the next interval.</span>
                </div>
                <div className="grade-grid">
                  {GRADES.map((entry) => (
                    <button
                      key={entry.grade}
                      type="button"
                      className={cn('grade-button', `grade-${entry.grade}`)}
                      onClick={() => handleGrade(entry.grade)}
                    >
                      <span className="grade-key">{entry.key}</span>
                      <strong>{entry.label}</strong>
                      <span className="grade-interval">
                        {previews?.[entry.grade] ?? formatInterval(card?.interval ?? 0)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="keyboard-hint is-center">
                  <kbd>1</kbd> Again <span>·</span> <kbd>2</kbd> Hard <span>·</span>{' '}
                  <kbd>3</kbd> Good <span>·</span> <kbd>4</kbd> Easy
                </div>
              </div>
            </div>
          )}
        </article>

        <div className="review-tip">
          <RotateCcw size={15} aria-hidden="true" />
          <span>
            {card
              ? `This word is at a ${formatInterval(card.interval)} interval with an ease of ${card.ease.toFixed(2)}.`
              : 'New card — your grade starts the learning schedule.'}
          </span>
        </div>
      </div>
    </div>
  );
}
