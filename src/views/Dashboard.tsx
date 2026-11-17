import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Cloud,
  Flame,
  RotateCcw,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { ALL_WORDS, LEVEL_COUNTS, WORD_BY_ID } from '../data/vocabulary';
import { LEVEL_INFO } from '../data/levels';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  addDays,
  dayKey,
  formatDue,
  formatLongDate,
  getGreeting,
  percent,
  pluralize,
} from '../lib/utils';
import {
  AppLink,
  EmptyState,
  LevelBadge,
  MiniBars,
  PageHeader,
  ProgressRing,
  SectionHead,
  SpeakerButton,
  StatCard,
} from '../components/ui';

export function Dashboard() {
  const { settings, stats, progress, studiedWords, sheetSync } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const goalPercent = percent(stats.practicedToday, settings.dailyGoal);
  const goalMet = stats.practicedToday >= settings.dailyGoal;

  const lastStudiedWord = progress.lastStudied
    ? WORD_BY_ID[progress.lastStudied.wordId]
    : undefined;
  const nextNewWord = ALL_WORDS.find((word) => !progress.cards[word.id]);
  const focusWord = nextNewWord ?? lastStudiedWord ?? ALL_WORDS[0];
  const focusLabel = nextNewWord
    ? stats.studied === 0
      ? 'Start here'
      : 'Continue learning'
    : lastStudiedWord
      ? 'Keep it fresh'
      : 'Start here';
  const focusLevelStat = focusWord
    ? stats.levelStats.find((level) => level.level === focusWord.level)
    : undefined;
  const focusExample = focusWord ? progress.generatedExamples[focusWord.id]?.[0] : undefined;
  const weekTotal = Array.from({ length: 7 }, (_, index) => {
    const entry = progress.activity[dayKey(addDays(new Date(), -index))];
    return (entry?.studied ?? 0) + (entry?.reviews ?? 0);
  }).reduce((total, value) => total + value, 0);
  const displayName = settings.displayName.trim() || 'learner';

  if (ALL_WORDS.length === 0) {
    return (
      <div className="view">
        <PageHeader
          eyebrow={formatLongDate()}
          title={`Welcome to Wordloom, ${displayName}.`}
          description="Your vocabulary studio is ready. Add words to src/data/vocabulary.ts to begin."
        />
        <EmptyState
          icon={<BookOpen size={24} />}
          title="Your word lists are empty"
          description="Each CEFR level accepts an array of words in src/data/vocabulary.ts. Add a few entries and they will appear here automatically."
        />
      </div>
    );
  }

  return (
    <div className="view">
      <PageHeader
        eyebrow={formatLongDate()}
        title={
          <>
            {getGreeting()}, <span className="title-accent">{displayName}</span>.
          </>
        }
        description="A few careful minutes today. Wordloom will bring the right words back before you forget them."
        actions={
          <div className="head-actions">
            <span className="streak-pill">
              <Flame size={16} aria-hidden="true" />
              <strong>{stats.streak}</strong>
              <span>day streak</span>
            </span>
            <AppLink to={{ name: 'settings' }} className="icon-button head-icon" aria-label="Settings">
              <Settings2 size={18} aria-hidden="true" />
            </AppLink>
          </div>
        }
      />

      {!sheetSync.email && (
        <div className="inline-alert is-info sync-prompt">
          <Cloud size={15} aria-hidden="true" />
          <span>
            <strong>Your progress is saved in this browser.</strong> Sign in with Google in{' '}
            <AppLink to={{ name: 'settings' }} className="text-link">
              Settings → Google Sheets
            </AppLink>{' '}
            to back it up across devices. Sync is optional.
          </span>
        </div>
      )}

      <div className="dash-hero-grid">
        <section className={stats.dueNow > 0 ? 'review-hero' : 'review-hero is-caught-up'}>
          <div className="review-hero-copy">
            <span className="hero-eyebrow">
              <RotateCcw size={14} aria-hidden="true" />
              Spaced repetition
            </span>
            <h2>
              {stats.dueNow > 0
                ? `${stats.dueNow} ${pluralize(stats.dueNow, 'word')} ready for review`
                : 'You are all caught up'}
            </h2>
            <p>
              {stats.dueNow > 0
                ? 'Recall them now, while the memory is still warm. A short review is all it takes.'
                : stats.studied === 0
                  ? 'Study your first word and Wordloom will schedule the next check-in for you.'
                  : `Nothing due right now${stats.nextDue ? `. Next review ${formatDue(stats.nextDue)}` : ''}.`}
            </p>
            <div className="review-hero-actions">
              {stats.dueNow > 0 ? (
                <AppLink to={{ name: 'review' }} className="button button-light">
                  Start review
                  <ArrowRight size={16} aria-hidden="true" />
                </AppLink>
              ) : stats.studied > 0 ? (
                <AppLink to={{ name: 'review', practice: true }} className="button button-light">
                  Practice anyway
                  <ArrowRight size={16} aria-hidden="true" />
                </AppLink>
              ) : focusWord ? (
                <AppLink
                  to={{ name: 'word', level: focusWord.level, wordId: focusWord.id }}
                  className="button button-light"
                >
                  Study your first word
                  <ArrowRight size={16} aria-hidden="true" />
                </AppLink>
              ) : null}
              <span className="review-hero-note">
                <Target size={14} aria-hidden="true" />
                {stats.dueNow > 0
                  ? 'Reviews keep strong memories strong.'
                  : `${stats.studied} ${pluralize(stats.studied, 'word')} in rotation`}
              </span>
            </div>
          </div>
          <div className="review-orbit" aria-hidden="true">
            <span className="review-orbit-ring" />
            <span className="review-orbit-ring is-outer" />
            <div className="review-count">
              {stats.dueNow > 0 ? (
                <>
                  <strong>{stats.dueNow}</strong>
                  <span>due now</span>
                </>
              ) : (
                <>
                  <Check size={30} />
                  <span>clear</span>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="goal-card">
          <div className="goal-card-head">
            <div>
              <span className="eyebrow">Daily goal</span>
              <h3>{goalMet ? 'Goal reached' : 'Your rhythm'}</h3>
            </div>
            <AppLink to={{ name: 'settings' }} className="button button-ghost button-small">
              Adjust
            </AppLink>
          </div>
          <div className="goal-main">
            <ProgressRing
              value={goalPercent}
              size={104}
              stroke={9}
              label={`${goalPercent}% of daily goal`}
            >
              <span className="ring-value">{goalPercent}%</span>
              <span className="ring-caption">
                {stats.practicedToday}/{settings.dailyGoal}
              </span>
            </ProgressRing>
            <div className="goal-stats">
              <div>
                <strong>{stats.practicedToday}</strong>
                <span>{pluralize(stats.practicedToday, 'practice')} today</span>
              </div>
              <div>
                <strong>
                  {stats.newToday}/{settings.newWordsPerDay}
                </strong>
                <span>new words</span>
              </div>
              <div>
                <strong>{stats.dueNow}</strong>
                <span>{pluralize(stats.dueNow, 'review')} waiting</span>
              </div>
            </div>
          </div>
          <MiniBars activity={progress.activity} days={7} />
        </section>
      </div>

      {focusWord && (
        <section className="continue-card">
          <div className="continue-main">
            <div className="continue-topline">
              <span className="eyebrow">
                <Sparkles size={13} aria-hidden="true" />
                {focusLabel}
              </span>
              <LevelBadge level={focusWord.level} />
            </div>
            <div className="continue-word-row">
              <h2 className="continue-word lang-target" lang={target.code}>{focusWord.term}</h2>
              <SpeakerButton
                text={focusWord.term}
                lang={target.tts}
                label={`Hear ${focusWord.term}`}
                size={19}
              />
            </div>
            {settings.showPronunciation && focusWord.pronunciation && (
              <p className="continue-pronunciation">/{focusWord.pronunciation}/</p>
            )}
            <p className="continue-definition" lang={native.code}>{focusWord.definition}</p>
            <div className="chip-row">
              <span className="chip">{LEVEL_INFO[focusWord.level].subtitle}</span>
              {settings.showPartOfSpeech && focusWord.partOfSpeech && (
                <span className="chip">{focusWord.partOfSpeech}</span>
              )}
              {(focusWord.tags ?? []).slice(0, 2).map((tag) => (
                <span className="chip chip-quiet" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="continue-actions">
              <AppLink
                to={{ name: 'word', level: focusWord.level, wordId: focusWord.id }}
                className="button button-primary"
              >
                {nextNewWord ? 'Study this word' : 'Review this word'}
                <ArrowRight size={16} aria-hidden="true" />
              </AppLink>
              <AppLink
                to={{ name: 'level', level: focusWord.level }}
                className="button button-ghost"
              >
                All {focusWord.level} words
              </AppLink>
            </div>
            {focusLevelStat && (
              <div className="continue-progress">
                <div className="continue-progress-labels">
                  <span>{focusWord.level} progress</span>
                  <span>
                    {focusLevelStat.studied}/{focusLevelStat.total} studied
                  </span>
                </div>
                <div className="progress-bar">
                  <span style={{ width: `${focusLevelStat.percent}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="continue-side">
            <span className="continue-side-label">In context</span>
            {focusExample ? (
              <>
                <blockquote className="continue-example lang-target" lang={target.code}>
                  {focusExample.target}
                </blockquote>
                {settings.showExampleTranslations && focusExample.native && (
                  <p className="continue-example-native" lang={native.code}>{focusExample.native}</p>
                )}
                <div className="continue-side-tools">
                  <SpeakerButton
                    text={focusExample.target}
                    lang={target.tts}
                    label="Hear the example sentence"
                  />
                  <span>{focusWord.level} · example</span>
                </div>
              </>
            ) : (
              <p className="continue-example-native">
                Examples appear here once you generate exercises with AI.
              </p>
            )}
            <div className="continue-side-footer">
              <TrendingUp size={14} aria-hidden="true" />
              <span>
                {studiedWords.length} of {ALL_WORDS.length} words in your rotation
              </span>
            </div>
          </div>
        </section>
      )}

      <section className="dash-levels">
        <SectionHead
          title="Your CEFR levels"
          description="Move from first words to near-native nuance. Every level has its own vocabulary deck."
        />
        <div className="level-grid">
          {stats.levelStats.map((level) => (
            <AppLink
              key={level.level}
              to={{ name: 'level', level: level.level }}
              className="level-card"
              data-level={level.level}
            >
              <div className="level-card-top">
                <span className="level-letter">{level.level}</span>
                <span className="level-card-arrow">
                  <ArrowUpRight size={16} aria-hidden="true" />
                </span>
              </div>
              <div className="level-card-title">
                <strong>{LEVEL_INFO[level.level].subtitle}</strong>
                <span>{LEVEL_COUNTS[level.level]} words</span>
              </div>
              <div className="level-card-foot">
                <span>{level.studied} studied</span>
                {level.due > 0 ? <span className="level-due">{level.due} due</span> : <span>{level.percent}%</span>}
              </div>
              <div className="progress-bar">
                <span style={{ width: `${level.percent}%` }} />
              </div>
            </AppLink>
          ))}
        </div>
      </section>

      <section className="dash-stats">
        <StatCard
          label="Words in rotation"
          value={stats.studied}
          hint={`of ${ALL_WORDS.length} across all levels`}
          icon={<BookOpen size={16} />}
        />
        <StatCard
          label="Strong recall"
          value={`${stats.strongRecall}%`}
          hint={`${stats.totalReviews} ${pluralize(stats.totalReviews, 'review')} logged`}
          icon={<Sparkles size={16} />}
        />
        <StatCard
          label="Mastered"
          value={stats.mastered}
          hint="21+ day intervals"
          icon={<Check size={16} />}
        />
        <StatCard
          label="This week"
          value={weekTotal}
          hint="study + review sessions"
          icon={<TrendingUp size={16} />}
        />
      </section>
    </div>
  );
}
