export enum PlayerLevel {
  INITIATION = 'Initiation',
  BEGINNER = 'Beginner',
  INITIATION_INTERMEDIATE = 'Initiation Intermediate',
  INTERMEDIATE = 'Intermediate',
  INTERMEDIATE_HIGH = 'Intermediate High',
  INTERMEDIATE_ADVANCED = 'Intermediate Advanced',
  COMPETITION = 'Competition',
  PROFESSIONAL = 'Professional',
}

export interface LevelRange {
  min: number;
  max: number;
  name: PlayerLevel;
}

export const LEVEL_RANGES: LevelRange[] = [
  { min: 0, max: 0.99, name: PlayerLevel.INITIATION },
  { min: 1.0, max: 1.49, name: PlayerLevel.BEGINNER },
  { min: 1.5, max: 2.4, name: PlayerLevel.INITIATION_INTERMEDIATE },
  { min: 2.5, max: 3.4, name: PlayerLevel.INTERMEDIATE },
  { min: 3.5, max: 4.4, name: PlayerLevel.INTERMEDIATE_HIGH },
  { min: 4.5, max: 5.4, name: PlayerLevel.INTERMEDIATE_ADVANCED },
  { min: 5.5, max: 5.6, name: PlayerLevel.COMPETITION },
  { min: 5.7, max: 7.0, name: PlayerLevel.PROFESSIONAL },
];

export function getLevelName(level: number): PlayerLevel {
  const range = LEVEL_RANGES.find((r) => level >= r.min && level <= r.max);
  return range ? range.name : PlayerLevel.BEGINNER;
}

