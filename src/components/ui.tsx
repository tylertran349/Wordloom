import { useEffect, useId, useRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import type { CEFRLevel, DayActivity } from '../types';
import type { Route } from '../types';
import { routeToHash } from '../lib/router';
import { useApp } from '../context/AppContext';
import { dayKey, addDays, cn, percent, startOfDay } from '../lib/utils';
import { speakText } from '../lib/speech';

export function AppLink({
  to,
  className,
  children,
  ...rest
}: { to: Route } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a href={routeToHash(to)} className={className} {...rest}>
      {children}
    </a>
  );
}

export function ProgressRing({
  value,
  size = 92,
  stroke = 8,
  tone = 'accent',
  children,
  className,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: 'accent' | 'light';
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const safe = Math.min(100, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  return (
    <div
      className={cn('ring', tone === 'light' && 'ring-light', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${safe}% complete`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-content">{children}</div>
    </div>
  );
}

export function LevelBadge({
  level,
  withName = false,
  className,
}: {
  level: CEFRLevel;
  withName?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('level-badge', className)} data-level={level}>
      <span className="level-badge-dot" aria-hidden="true" />
      {level}
      {withName && <span className="level-badge-name">CEFR</span>}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}

export function SectionHead({
  title,
  description,
  action,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="section-head" id={id}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    document.body.style.overflow = 'hidden';
    root.style.overflow = 'hidden';
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="confirm-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <h2 id={titleId}>{title}</h2>
        {description && <div id={descriptionId}>{description}</div>}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button button-ghost button-small"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="button button-danger-solid button-small"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SpeakerButton({
  text,
  lang,
  label = 'Play audio',
  className,
  size = 16,
}: {
  text: string;
  lang: string;
  label?: string;
  className?: string;
  size?: number;
}) {
  const { settings, notify } = useApp();
  return (
    <button
      type="button"
      className={cn('icon-button speaker-button', className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void speakText(text, lang, settings.ttsRate, settings.ttsProvider).then((ok) => {
          if (!ok) notify('Speech playback is not available in this browser.', 'error');
        });
      }}
      aria-label={label}
      title={label}
    >
      <Volume2 size={size} aria-hidden="true" />
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cn('toggle-row', disabled && 'is-disabled')}>
      <div className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={cn('switch', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

export function MiniBars({
  activity,
  days = 7,
  className,
}: {
  activity: Record<string, DayActivity>;
  days?: number;
  className?: string;
}) {
  const today = startOfDay();
  const values = Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - (days - 1));
    const entry = activity[dayKey(date)];
    return {
      date,
      total: (entry?.studied ?? 0) + (entry?.reviews ?? 0),
      isToday: dayKey(date) === dayKey(today),
    };
  });
  const max = Math.max(1, ...values.map((entry) => entry.total));

  return (
    <div
      className={cn('mini-bars', className)}
      role="img"
      aria-label={`Activity over the last ${days} days`}
    >
      {values.map((entry) => (
        <div
          className={cn('mini-bar-day', entry.isToday && 'is-today')}
          key={entry.date.toISOString()}
          title={`${entry.date.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}: ${entry.total} ${entry.total === 1 ? 'practice' : 'practices'}`}
        >
          <div className="mini-bar-track">
            <div
              className="mini-bar-fill"
              style={{ height: `${Math.max(entry.total > 0 ? 12 : 4, percent(entry.total, max))}%` }}
            />
          </div>
          <span className="mini-bar-label">
            {entry.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        </div>
      ))}
    </div>
  );
}
