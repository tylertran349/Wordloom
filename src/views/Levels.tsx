import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import type { CEFRLevel } from '../types';
import { CEFR_LEVELS } from '../types';
import { LEVEL_INFO } from '../data/levels';
import { LEVEL_WORDS } from '../data/vocabulary';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  cn,
  formatDue,
  isCEFRLevel,
  pluralize,
} from '../lib/utils';
import {
  AppLink,
  EmptyState,
  PageHeader,
  ProgressRing,
  SpeakerButton,
} from '../components/ui';

type Filter = 'all' | 'new' | 'due' | 'learning' | 'review' | 'mastered';
type SortMode = 'default' | 'alphabetical' | 'due';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'due', label: 'Due' },
  { value: 'learning', label: 'Learning' },
  { value: 'review', label: 'Reviewing' },
  { value: 'mastered', label: 'Mastered' },
];

function statusFor(
  wordId: string,
  cards: ReturnType<typeof useApp>['progress']['cards'],
  seenWords: ReturnType<typeof useApp>['progress']['seenWords'],
) {
  const card = cards[wordId];
  if (!card) {
    return seenWords[wordId]
      ? { key: 'seen' as const, label: 'Seen' }
      : { key: 'new' as const, label: 'New' };
  }
  if (card.status === 'mastered') return { key: 'mastered' as const, label: 'Mastered' };
  if (card.status === 'learning') return { key: 'learning' as const, label: 'Learning' };
  return { key: 'review' as const, label: 'Reviewing' };
}

export function Levels({ level: levelProp }: { level: CEFRLevel }) {
  const level = isCEFRLevel(levelProp) ? levelProp : 'A1';
  const {
    settings,
    progress,
    stats,
    levelDecks,
    shuffleWordOrder,
    updateSettings,
  } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const native = getLanguage(settings.nativeLanguage);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortMode>('default');

  const levelStat = stats.levelStats.find((entry) => entry.level === level)!;
  const words = levelDecks[level] ?? [];
  const selectedSort = sort === 'default' ? settings.newWordOrder : sort;
  const info = LEVEL_INFO[level];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = words.filter((word) => {
      if (
        needle &&
        !`${word.term} ${word.definition} ${(word.tags ?? []).join(' ')}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      const card = progress.cards[word.id];
      if (filter === 'new') return !card && !progress.seenWords[word.id];
      if (filter === 'due') return Boolean(card && card.due <= Date.now());
      if (filter === 'learning') return card?.status === 'learning';
      if (filter === 'review') return card?.status === 'review';
      if (filter === 'mastered') return card?.status === 'mastered';
      return true;
    });

    if (sort === 'alphabetical') {
      return [...result].sort((a, b) => a.term.localeCompare(b.term, settings.targetLanguage));
    }
    if (sort === 'due') {
      return [...result].sort((a, b) => {
        const aDue = progress.cards[a.id]?.due ?? Number.MAX_SAFE_INTEGER;
        const bDue = progress.cards[b.id]?.due ?? Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      });
    }
    return result;
  }, [words, query, filter, sort, progress.cards, progress.seenWords, settings.targetLanguage, stats.dueNow]);

  // A word counts as new only if it has never been opened and is not in the
  // review queue. Words seen earlier but skipped are not offered again.
  const nextWord =
    words.find((word) => !progress.cards[word.id] && !progress.seenWords[word.id]) ?? words[0];
  const savedIndex = progress.levelPositions[level];
  // Positions are recorded in vocabulary-file order, so the saved word stays
  // valid when the visible deck is randomly ordered.
  const deckWords = LEVEL_WORDS[level] ?? [];
  const savedWord =
    savedIndex !== undefined && Number.isInteger(savedIndex) && deckWords[savedIndex]
      ? deckWords[savedIndex]
      : undefined;
  const resumeIndex = savedWord ? words.findIndex((word) => word.id === savedWord.id) : -1;
  const resumeWord = resumeIndex >= 0 ? savedWord : undefined;
  const newTodayInLevel = words.filter((word) => {
    const card = progress.cards[word.id];
    return card && new Date(card.createdAt).toDateString() === new Date().toDateString();
  }).length;

  return (
    <div className="view">
      <PageHeader
        eyebrow={
          <>
            <span className="eyebrow-dot" data-level={level} />
            CEFR {level} · {info.subtitle}
          </>
        }
        title={
          <>
            {level} <span className="title-muted">{info.name}</span>
          </>
        }
        description={info.description}
        actions={
          <div className="head-actions">
            {levelStat.due > 0 && (
              <AppLink to={{ name: 'review' }} className="button button-ghost">
                <RotateCcw size={15} aria-hidden="true" />
                {levelStat.due} due
              </AppLink>
            )}
            {nextWord ? (
              <AppLink
                to={{
                  name: 'word',
                  level,
                  wordId: resumeWord ? resumeWord.id : nextWord.id,
                }}
                className="button button-primary"
              >
                {resumeWord
                  ? `Resume at #${resumeIndex + 1}`
                  : progress.cards[nextWord.id]
                    ? 'Practice a word'
                    : progress.seenWords[nextWord.id]
                      ? 'Revisit a word'
                      : 'Study next word'}
                <ArrowRight size={16} aria-hidden="true" />
              </AppLink>
            ) : null}
          </div>
        }
      />

      <nav className="level-tabs" aria-label="CEFR levels">
        {CEFR_LEVELS.map((tab) => {
          const tabStat = stats.levelStats.find((entry) => entry.level === tab);
          return (
            <AppLink
              key={tab}
              to={{ name: 'level', level: tab }}
              className={cn('level-tab', tab === level && 'is-active')}
              data-level={tab}
              aria-current={tab === level ? 'page' : undefined}
            >
              <span className="level-tab-letter">{tab}</span>
              <span className="level-tab-count">{tabStat?.total ?? 0}</span>
            </AppLink>
          );
        })}
      </nav>

      <section className="level-summary" data-level={level}>
        <div className="level-summary-progress">
          <ProgressRing
            value={levelStat.percent}
            size={72}
            stroke={7}
            label={`${levelStat.percent}% of ${level} studied`}
          >
            <span className="ring-value is-small">{levelStat.percent}%</span>
          </ProgressRing>
          <div>
            <span className="summary-label">Deck progress</span>
            <strong>
              {levelStat.studied} of {levelStat.total} words studied
            </strong>
          </div>
        </div>
        <div className="level-summary-stats">
          <div>
            <span>Due now</span>
            <strong>{levelStat.due}</strong>
          </div>
          <div>
            <span>Mastered</span>
            <strong>{levelStat.mastered}</strong>
          </div>
          <div>
            <span>New today</span>
            <strong>
              {newTodayInLevel}/{settings.newWordsPerDay}
            </strong>
          </div>
          <div>
            <span>Exercises</span>
            <strong>{settings.exercisesPerWord}</strong>
          </div>
        </div>
      </section>

      <section className="word-deck">
        <div className="deck-toolbar">
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${level} words, meanings, or tags`}
              aria-label={`Search ${level} vocabulary`}
            />
          </div>
          <div className="deck-controls">
            <div className="filter-chips" role="group" aria-label="Filter vocabulary">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn('filter-chip', filter === item.value && 'is-active')}
                  onClick={() => setFilter(item.value)}
                  aria-pressed={filter === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="sort-control">
              <label className="sr-only" htmlFor="deck-sort">
                Sort words
              </label>
              <select
                id="deck-sort"
                className="select-input select-small"
                value={selectedSort}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'random' || value === 'deck') {
                    updateSettings({ newWordOrder: value });
                    setSort('default');
                    return;
                  }
                  setSort(value as SortMode);
                }}
              >
                <option value="random">Random order</option>
                <option value="deck">Deck order</option>
                <option value="alphabetical">A–Z</option>
                <option value="due">Due first</option>
              </select>
              <ChevronDown size={14} className="select-chevron" aria-hidden="true" />
            </div>
            {selectedSort === 'random' && (
              <button
                type="button"
                className="icon-button"
                onClick={shuffleWordOrder}
                title="Shuffle new words into a different order"
                aria-label="Shuffle new word order"
              >
                <Shuffle size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {words.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={24} />}
            title={`No ${level} words yet`}
            description={
              level === 'C1' || level === 'C2' ? (
                <>
                  This deck is intentionally empty. The built-in 3,000-word set covers A1–B2. Add
                  C1 or C2 entries in <code>src/data/corpus/</code> and run{' '}
                  <code>npm run vocab:build</code>.
                </>
              ) : (
                <>
                  Add entries to the corpus in <code>src/data/corpus/</code> and run{' '}
                  <code>npm run vocab:build</code>. Each level is a plain array of words; examples
                  and exercises are generated with AI.
                </>
              )
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No words match"
            description="Try a different search, or reset the filter to see the whole deck."
            action={
              <button
                type="button"
                className="button button-ghost"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            <div className="deck-meta">
              <span>
                {filtered.length} {pluralize(filtered.length, 'word')}
                {query.trim() ? ` matching “${query.trim()}”` : ''}
              </span>
              <span>Click a word to study and practise it.</span>
            </div>
            <div className="word-list">
              {filtered.map((word) => {
                const card = progress.cards[word.id];
                const status = statusFor(word.id, progress.cards, progress.seenWords);
                const due = card && card.due <= Date.now();
                const exampleCount = progress.generatedExamples[word.id]?.length ?? 0;
                return (
                  <div className="word-row" key={word.id}>
                    <AppLink
                      to={{ name: 'word', level, wordId: word.id }}
                      className="word-row-link"
                    >
                      <div className="word-row-body">
                        <div className="word-row-heading">
                          <h3 className="lang-target" lang={target.code}>{word.term}</h3>
                          {settings.showPronunciation && word.pronunciation && (
                            <span className="word-row-pron">/{word.pronunciation}/</span>
                          )}
                          <span
                            className={`status-pill status-${status.key}`}
                            title={
                              status.key === 'seen'
                                ? 'You opened this word before, but did not add it to the review queue'
                                : undefined
                            }
                          >
                            {status.label}
                          </span>
                          {resumeWord?.id === word.id && (
                            <span className="status-pill status-resume">
                              Resume · #{resumeIndex + 1}
                            </span>
                          )}
                          {due && (
                            <span className="status-pill status-due">
                              <span className="status-dot" /> Due
                            </span>
                          )}
                        </div>
                        <p className="word-row-definition" lang={native.code}>{word.definition}</p>
                        <div className="word-row-tags">
                          {settings.showPartOfSpeech && word.partOfSpeech && (
                            <span>{word.partOfSpeech}</span>
                          )}
                          {(word.tags ?? []).map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                          <span>
                            {exampleCount > 0
                              ? `${exampleCount} ${pluralize(exampleCount, 'example')}`
                              : 'No examples yet'}
                          </span>
                        </div>
                      </div>
                      <div className="word-row-side">
                        <span className="word-row-due">
                          {card ? (due ? 'Ready now' : formatDue(card.due)) : 'Not studied yet'}
                        </span>
                        <span className="word-row-go">
                          <ArrowRight size={16} aria-hidden="true" />
                        </span>
                      </div>
                    </AppLink>
                    <SpeakerButton
                      className="word-row-audio"
                      text={word.term}
                      lang={target.tts}
                      label={`Hear ${word.term}`}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <div className="level-footer-note">
        <Sparkles size={15} aria-hidden="true" />
        <span>
          {levelStat.studied === levelStat.total && levelStat.total > 0
            ? `You have studied every ${level} word. Keep them warm with reviews.`
            : `Study a word once, then Wordloom schedules reviews at growing intervals.`}
        </span>
        {levelStat.studied > 0 && (
          <AppLink to={{ name: 'progress' }} className="text-link">
            See progress
            <Check size={14} aria-hidden="true" />
          </AppLink>
        )}
      </div>
    </div>
  );
}
