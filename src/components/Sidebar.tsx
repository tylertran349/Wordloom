import {
  BarChart3,
  BookOpen,
  Flame,
  LayoutDashboard,
  RotateCcw,
  Settings as SettingsIcon,
  Upload,
} from 'lucide-react';
import type { Route } from '../types';
import { CEFR_LEVELS } from '../types';
import { useApp } from '../context/AppContext';
import { AppLink } from './ui';
import { cn } from '../lib/utils';

function WeaveMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M3.5 7c4.2 0 4.2 3.2 8.5 3.2S16.3 7 20.5 7" strokeLinecap="round" />
      <path d="M3.5 12c4.2 0 4.2 3.2 8.5 3.2s4.3-3.2 8.5-3.2" strokeLinecap="round" />
      <path d="M3.5 17c4.2 0 4.2-3.2 8.5-3.2" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const { stats, settings } = useApp();
  const isStudyRoute = route.name === 'level' || route.name === 'word';
  const activeLevel =
    route.name === 'level' || route.name === 'word' ? route.level : null;
  const fallbackLevel = stats.levelStats.find((level) => level.studied < level.total)?.level ?? 'A1';
  const studyTarget: Route = {
    name: 'level',
    level: activeLevel ?? fallbackLevel,
  };

  const goalPercent = Math.min(
    100,
    Math.round((stats.practicedToday / Math.max(1, settings.dailyGoal)) * 100),
  );

  return (
    <aside className="sidebar">
      <AppLink to={{ name: 'dashboard' }} className="brand" aria-label="Wordloom home">
        <span className="brand-mark">
          <WeaveMark />
        </span>
        <span className="brand-copy">
          <span className="brand-name">Wordloom</span>
          <span className="brand-tag">Words that stick</span>
        </span>
      </AppLink>

      <nav className="nav" aria-label="Primary">
        <span className="side-label">Study</span>
        <AppLink
          to={{ name: 'dashboard' }}
          className={cn('nav-item', route.name === 'dashboard' && 'is-active')}
          aria-current={route.name === 'dashboard' ? 'page' : undefined}
        >
          <LayoutDashboard size={18} className="nav-icon" aria-hidden="true" />
          <span className="nav-label">Today</span>
        </AppLink>
        <AppLink
          to={studyTarget}
          className={cn('nav-item', isStudyRoute && 'is-active')}
          aria-current={isStudyRoute ? 'page' : undefined}
        >
          <BookOpen size={18} className="nav-icon" aria-hidden="true" />
          <span className="nav-label">Study</span>
        </AppLink>
        <AppLink
          to={{ name: 'review' }}
          className={cn('nav-item', route.name === 'review' && 'is-active')}
          aria-current={route.name === 'review' ? 'page' : undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (route.name === 'review') {
              window.dispatchEvent(new Event('wordloom:restart-review'));
            }
          }}
        >
          <RotateCcw size={18} className="nav-icon" aria-hidden="true" />
          <span className="nav-label">Review</span>
          {stats.dueNow > 0 && <span className="nav-badge">{stats.dueNow}</span>}
        </AppLink>
        <AppLink
          to={{ name: 'progress' }}
          className={cn('nav-item', route.name === 'progress' && 'is-active')}
          aria-current={route.name === 'progress' ? 'page' : undefined}
        >
          <BarChart3 size={18} className="nav-icon" aria-hidden="true" />
          <span className="nav-label">Progress</span>
        </AppLink>
        <AppLink
          to={{ name: 'import' }}
          className={cn('nav-item', route.name === 'import' && 'is-active')}
          aria-current={route.name === 'import' ? 'page' : undefined}
        >
          <Upload size={18} className="nav-icon" aria-hidden="true" />
          <span className="nav-label">Import</span>
        </AppLink>

        <span className="side-label side-label-spaced">Levels</span>
        <div className="side-levels">
          {CEFR_LEVELS.map((level) => (
            <AppLink
              key={level}
              to={{ name: 'level', level }}
              className={cn('side-level', activeLevel === level && 'is-active')}
              aria-current={activeLevel === level ? 'page' : undefined}
              data-level={level}
              title={`CEFR ${level}`}
            >
              {level}
            </AppLink>
          ))}
        </div>
      </nav>

      <div className="side-spacer" />

      <div className="side-streak">
        <div className="side-streak-top">
          <span className="side-streak-days">
            <Flame size={15} aria-hidden="true" />
            <strong>{stats.streak}</strong>
            <span>day streak</span>
          </span>
          {stats.dueNow > 0 && <span className="side-due-dot" title={`${stats.dueNow} words due`} />}
        </div>
        <div className="side-goal-row">
          <span>Today</span>
          <span>
            {stats.practicedToday}/{settings.dailyGoal}
          </span>
        </div>
        <div className="progress-bar is-small" aria-hidden="true">
          <span style={{ width: `${goalPercent}%` }} />
        </div>
      </div>

      <AppLink
        to={{ name: 'settings' }}
        className={cn('nav-item nav-settings', route.name === 'settings' && 'is-active')}
        aria-current={route.name === 'settings' ? 'page' : undefined}
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon size={18} className="nav-icon" aria-hidden="true" />
        <span className="nav-label">Settings</span>
      </AppLink>

      <div className="side-footer">
        <span>Local-first</span>
        <span aria-hidden="true">·</span>
        <span>v1.0</span>
      </div>
    </aside>
  );
}
