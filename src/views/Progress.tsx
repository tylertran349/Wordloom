import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Flame,
  History,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { LEVEL_INFO } from '../data/levels';
import { WORD_BY_ID } from '../data/vocabulary';
import { useApp } from '../context/AppContext';
import { getLanguage } from '../data/languages';
import {
  addDays,
  cn,
  dayKey,
  endOfDay,
  formatShortDate,
  formatTime,
  percent,
  pluralize,
  startOfDay,
} from '../lib/utils';
import {
  AppLink,
  EmptyState,
  LevelBadge,
  PageHeader,
  StatCard,
} from '../components/ui';

export function Progress() {
  const { settings, progress, stats, studiedWords } = useApp();
  const target = getLanguage(settings.targetLanguage);
  const today = startOfDay();
  const cards = Object.values(progress.cards).filter((card) => Boolean(WORD_BY_ID[card.wordId]));

  const activityDays = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    const entry = progress.activity[dayKey(date)] ?? { studied: 0, reviews: 0 };
    return {
      date,
      studied: entry.studied,
      reviews: entry.reviews,
      total: entry.studied + entry.reviews,
      isToday: dayKey(date) === dayKey(today),
    };
  });
  const activityMax = Math.max(1, ...activityDays.map((day) => day.total));
  const periodTotal = activityDays.reduce((total, day) => total + day.total, 0);

  const forecast = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    const start = startOfDay(date).getTime();
    const end = endOfDay(date).getTime();
    const count = cards.filter((card) =>
      index === 0 ? card.due <= end : card.due > start && card.due <= end,
    ).length;
    return { date, count, isToday: index === 0 };
  });
  const forecastMax = Math.max(1, ...forecast.map((day) => day.count));

  const heatDays = Array.from({ length: 84 }, (_, index) => {
    const date = addDays(today, index - 83);
    const entry = progress.activity[dayKey(date)] ?? { studied: 0, reviews: 0 };
    return { date, total: entry.studied + entry.reviews };
  });

  const recentReviews = progress.reviewLog
    .filter((entry) => Boolean(WORD_BY_ID[entry.wordId]))
    .slice(0, 10);
  const averagePerDay = periodTotal > 0 ? periodTotal / 14 : 0;
  const averageLabel =
    averagePerDay === 0
      ? '0'
      : averagePerDay < 1
        ? averagePerDay.toFixed(1)
        : String(Math.round(averagePerDay));
  const levelWithMostProgress = [...stats.levelStats].sort((a, b) => b.studied - a.studied)[0];
  const focusLevel =
    stats.levelStats.find((level) => level.studied < level.total)?.level ??
    levelWithMostProgress?.level ??
    'A1';

  return (
    <div className="view">
      <PageHeader
        eyebrow="Your learning record"
        title="Progress"
        description="The quiet arithmetic of showing up: words in rotation, recall strength, and the schedule ahead."
        actions={
          <span className="streak-pill">
            <Flame size={16} aria-hidden="true" />
            <strong>{stats.streak}</strong>
            <span>day streak</span>
          </span>
        }
      />

      <section className="stats-strip">
        <StatCard
          label="Words in rotation"
          value={stats.studied}
          hint={`${stats.mastered} mastered · ${stats.learning} learning`}
          icon={<BarChart3 size={16} />}
        />
        <StatCard
          label="Strong recall"
          value={`${stats.strongRecall}%`}
          hint={`${stats.totalReviews} total ${pluralize(stats.totalReviews, 'review')}`}
          icon={<Sparkles size={16} />}
        />
        <StatCard
          label="Due now"
          value={stats.dueNow}
          hint={`${stats.dueToday} due today`}
          icon={<Target size={16} />}
        />
        <StatCard
          label="Mastered"
          value={stats.mastered}
          hint="21+ day review intervals"
          icon={<Trophy size={16} />}
        />
      </section>

      <div className="progress-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Momentum</span>
              <h2>Last 14 days</h2>
            </div>
            <div className="chart-legend">
              <span><i className="legend-dot is-study" /> New study</span>
              <span><i className="legend-dot is-review" /> Reviews</span>
              <strong>{periodTotal} total</strong>
            </div>
          </div>
          <div
            className="daily-chart"
            role="img"
            aria-label={`Daily study and review activity for the last 14 days. ${periodTotal} total practices.`}
          >
            {activityDays.map((day) => (
              <div
                className={cn('daily-column', day.isToday && 'is-today')}
                key={day.date.toISOString()}
                title={`${day.date.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}: ${day.studied} studied, ${day.reviews} reviewed`}
              >
                <div className="daily-track">
                  <span
                    className="daily-fill is-review"
                    style={{ height: `${percent(day.reviews, activityMax)}%` }}
                  />
                  <span
                    className="daily-fill is-study"
                    style={{ height: `${percent(day.studied, activityMax)}%` }}
                  />
                </div>
                <span className="daily-label">
                  {day.isToday ? 'Today' : day.date.getDate()}
                </span>
              </div>
            ))}
          </div>
          <div className="panel-foot">
            <span>
              <TrendingUp size={14} aria-hidden="true" />
              {periodTotal > 0
                ? `${averageLabel} ${pluralize(Number(averageLabel), 'practice')} per day on average`
                : 'Your activity will appear here as you study.'}
            </span>
            <AppLink to={{ name: 'review' }} className="text-link">
              Review now
              <ArrowRight size={14} aria-hidden="true" />
            </AppLink>
          </div>
        </section>

        <section className="panel forecast-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Looking ahead</span>
              <h2>Next 7 days</h2>
            </div>
            <CalendarDays size={18} className="panel-head-icon" aria-hidden="true" />
          </div>
          <div
            className="forecast-chart"
            role="img"
            aria-label={`Due reviews over the next seven days. ${forecast
              .map((day) => `${day.date.toLocaleDateString(undefined, { weekday: 'long' })}: ${day.count}`)
              .join(', ')}.`}
          >
            {forecast.map((day) => (
              <div className="forecast-day" key={day.date.toISOString()}>
                <span className="forecast-count">{day.count > 0 ? day.count : ''}</span>
                <div className="forecast-track">
                  <span
                    className={cn('forecast-fill', day.isToday && 'is-today')}
                    style={{ height: `${Math.max(day.count > 0 ? 12 : 3, percent(day.count, forecastMax))}%` }}
                  />
                </div>
                <span className="forecast-label">
                  {day.isToday
                    ? 'Today'
                    : day.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
              </div>
            ))}
          </div>
          <div className="panel-foot">
            <span>
              {stats.dueNow > 0
                ? 'Reviews are due now.'
                : stats.nextDue
                  ? `Next review is scheduled for ${new Date(stats.nextDue).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}.`
                  : 'Add a word to start the schedule.'}
            </span>
          </div>
        </section>
      </div>

      <div className="progress-grid is-uneven">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Coverage</span>
              <h2>By CEFR level</h2>
            </div>
            <AppLink to={{ name: 'level', level: focusLevel }} className="text-link">
              Continue {focusLevel}
              <ArrowRight size={14} aria-hidden="true" />
            </AppLink>
          </div>
          <div className="level-progress-list">
            {stats.levelStats.map((level) => (
              <AppLink
                key={level.level}
                to={{ name: 'level', level: level.level }}
                className="level-progress-row"
              >
                <LevelBadge level={level.level} />
                <div className="level-progress-main">
                  <div className="level-progress-labels">
                    <strong>{LEVEL_INFO[level.level].subtitle}</strong>
                    <span>
                      {level.studied} of {level.total} studied
                    </span>
                  </div>
                  <div className="progress-bar is-small">
                    <span style={{ width: `${level.percent}%` }} />
                  </div>
                </div>
                <div className="level-progress-value">
                  <strong>{level.percent}%</strong>
                  <span>{level.due} due</span>
                </div>
              </AppLink>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Consistency</span>
              <h2>Activity map</h2>
            </div>
            <span className="heatmap-total">
              {heatDays.reduce((total, day) => total + day.total, 0)} in 12 weeks
            </span>
          </div>
          <div
            className="heatmap"
            role="img"
            aria-label={`Activity heat map for the last 12 weeks. ${heatDays.reduce(
              (total, day) => total + day.total,
              0,
            )} total practices.`}
          >
            {heatDays.map((day) => {
              const intensity =
                day.total === 0 ? 0 : day.total < 2 ? 1 : day.total < 4 ? 2 : day.total < 7 ? 3 : 4;
              return (
                <span
                  key={day.date.toISOString()}
                  className={`heat-cell heat-${intensity}`}
                  title={`${formatShortDate(day.date)}: ${day.total} ${
                    day.total === 1 ? 'practice' : 'practices'
                  }`}
                />
              );
            })}
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            <i className="heat-cell heat-0" />
            <i className="heat-cell heat-1" />
            <i className="heat-cell heat-2" />
            <i className="heat-cell heat-3" />
            <i className="heat-cell heat-4" />
            <span>More</span>
          </div>
          <div className="panel-foot">
            <span>
              <Check size={14} aria-hidden="true" />
              {studiedWords.length} {pluralize(studiedWords.length, 'word')} in your library
            </span>
          </div>
        </section>
      </div>

      <section className="panel history-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Recall log</span>
            <h2>Recent reviews</h2>
          </div>
          <History size={18} className="panel-head-icon" aria-hidden="true" />
        </div>
        {recentReviews.length === 0 ? (
          <EmptyState
            icon={<History size={22} />}
            title="No reviews yet"
            description="Once you start reviewing, your grades and intervals will be logged here."
            action={
              <AppLink to={{ name: 'review' }} className="button button-ghost">
                Open review
              </AppLink>
            }
          />
        ) : (
          <div className="review-history">
            {recentReviews.map((entry, index) => {
              const word = WORD_BY_ID[entry.wordId];
              if (!word) return null;              return (
                <AppLink
                  key={`${entry.wordId}-${entry.at}-${index}`}
                  to={{ name: 'word', level: word.level, wordId: word.id }}
                  className="history-row"
                >
                  <LevelBadge level={word.level} />
                  <div className="history-word">
                    <strong className="lang-target" lang={target.code}>{word.term}</strong>
                    <span>{word.definition}</span>
                  </div>
                  <span className={cn('grade-tag', `grade-${entry.grade}`)}>{entry.grade}</span>
                  <span className="history-meta">
                    {formatTime(entry.at)} · {formatShortDate(entry.at)}
                  </span>
                  <span className="history-meta">
                    next {entry.interval < 1 ? 'soon' : `${Math.round(entry.interval)}d`}
                  </span>
                  <ArrowRight size={14} className="history-go" aria-hidden="true" />
                </AppLink>
              );
            })}
          </div>
        )}
      </section>

      <div className="progress-footer-note">
        <Target size={15} aria-hidden="true" />
        <span>
          Strong recall counts “Good” and “Easy” reviews. Mastered words have intervals of at least
          three weeks.
        </span>
        <span className="progress-footer-lang">{target.label} deck</span>
      </div>
    </div>
  );
}
