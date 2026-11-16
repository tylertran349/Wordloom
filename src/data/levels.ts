import type { CEFRLevel } from '../types';

export interface LevelInfo {
  level: CEFRLevel;
  name: string;
  subtitle: string;
  description: string;
}

export const LEVEL_INFO: Record<CEFRLevel, LevelInfo> = {
  A1: {
    level: 'A1',
    name: 'Breakthrough',
    subtitle: 'Beginner',
    description: 'Everyday words, greetings, and the simple phrases you need to get by.',
  },
  A2: {
    level: 'A2',
    name: 'Waystage',
    subtitle: 'Elementary',
    description: 'Routine situations, familiar topics, and short, practical exchanges.',
  },
  B1: {
    level: 'B1',
    name: 'Threshold',
    subtitle: 'Intermediate',
    description: 'Handle familiar matters with confidence and explain your opinions.',
  },
  B2: {
    level: 'B2',
    name: 'Vantage',
    subtitle: 'Upper intermediate',
    description: 'Discuss complex ideas with fluency, nuance, and a wider vocabulary.',
  },
  C1: {
    level: 'C1',
    name: 'Effective operational proficiency',
    subtitle: 'Advanced',
    description: 'Express yourself spontaneously and precisely across demanding topics.',
  },
  C2: {
    level: 'C2',
    name: 'Mastery',
    subtitle: 'Proficient',
    description: 'Near-native nuance, subtle shades of meaning, and effortless precision.',
  },
};
