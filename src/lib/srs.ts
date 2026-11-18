import type { ReviewGrade, Settings, SRSCard, SRSConfig } from '../types';
import { clamp, formatInterval } from './utils';

export const DAY_MS = 86_400_000;

export const DEFAULT_SRS: SRSConfig = {
  startingEase: 2.5,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  maxIntervalDays: 365,
  learningStepMinutes: 10,
};

/** The scheduling subset of the learner's settings, as the scheduler sees it. */
export function srsConfigFromSettings(settings: Settings): SRSConfig {
  return {
    startingEase: settings.startingEase,
    easyBonus: settings.easyBonus,
    hardMultiplier: settings.hardMultiplier,
    maxIntervalDays: settings.maxIntervalDays,
    learningStepMinutes: settings.learningStepMinutes,
  };
}

export function createCard(wordId: string, config: SRSConfig, now = Date.now()): SRSCard {
  const learningInterval = config.learningStepMinutes / (24 * 60);
  return {
    wordId,
    ease: config.startingEase,
    interval: learningInterval,
    repetitions: 0,
    lapses: 0,
    due: now + config.learningStepMinutes * 60_000,
    createdAt: now,
    totalReviews: 0,
    status: 'learning',
  };
}

/**
 * A lightly customized SM-2 scheduler.
 *
 * Again  → back to a short learning step, ease decreases, lapse recorded
 * Hard   → a restrained step that always stays below the Good interval
 * Good   → 1 day for a new card, then growth by the current ease factor
 * Easy   → 3 days for a new card, then the Good interval plus the easy bonus
 */
export function scheduleCard(
  card: SRSCard,
  grade: ReviewGrade,
  config: SRSConfig,
  now = Date.now(),
): SRSCard {
  const next: SRSCard = {
    ...card,
    lastReviewed: now,
    totalReviews: card.totalReviews + 1,
  };
  const currentInterval = Math.max(card.interval || 1, 1);
  const goodInterval = Math.max(currentInterval + 1, currentInterval * card.ease);

  switch (grade) {
    case 'again': {
      next.ease = Math.max(1.3, Math.round((card.ease - 0.2) * 100) / 100);
      next.repetitions = 0;
      next.lapses = card.lapses + 1;
      next.interval = config.learningStepMinutes / (24 * 60);
      break;
    }
    case 'hard': {
      next.ease = Math.max(1.3, Math.round((card.ease - 0.15) * 100) / 100);
      next.repetitions = card.repetitions + 1;
      next.interval =
        card.repetitions === 0
          ? 0.5
          : Math.min(
              goodInterval * 0.9,
              Math.max(currentInterval + 0.5, currentInterval * config.hardMultiplier),
            );
      break;
    }
    case 'good': {
      next.repetitions = card.repetitions + 1;
      next.interval = card.repetitions === 0 ? 1 : goodInterval;
      break;
    }
    case 'easy': {
      next.ease = Math.min(3.5, Math.round((card.ease + 0.15) * 100) / 100);
      next.repetitions = card.repetitions + 1;
      next.interval =
        card.repetitions === 0 ? 3 : goodInterval * Math.max(1, config.easyBonus);
      break;
    }
    default:
      break;
  }

  next.interval = clamp(next.interval, 1 / (24 * 60), config.maxIntervalDays);
  next.due = now + next.interval * DAY_MS;
  next.status = next.interval >= 21 ? 'mastered' : next.interval < 1 ? 'learning' : 'review';
  return next;
}

export function previewGradeIntervals(
  card: SRSCard,
  config: SRSConfig,
  now = Date.now(),
): Record<ReviewGrade, string> {
  const grades: ReviewGrade[] = ['again', 'hard', 'good', 'easy'];
  return grades.reduce(
    (preview, grade) => {
      const scheduled = scheduleCard(card, grade, config, now);
      preview[grade] = formatInterval(scheduled.interval);
      return preview;
    },
    {} as Record<ReviewGrade, string>,
  );
}

export function isDue(card: SRSCard | undefined, now = Date.now()): boolean {
  return Boolean(card && card.due <= now);
}
