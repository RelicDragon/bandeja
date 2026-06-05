import { LevelChangeEventType } from '@prisma/client';

export type LevelChangeRevertScope = 'outcomes' | 'social' | 'all';

const OUTCOMES_EVENT_TYPES: LevelChangeEventType[] = [
  LevelChangeEventType.GAME,
  LevelChangeEventType.SET,
];

const SOCIAL_EVENT_TYPES: LevelChangeEventType[] = [
  LevelChangeEventType.SOCIAL_PARTICIPANT,
  LevelChangeEventType.SOCIAL_BAR,
];

const ALL_GAME_LINKED_EVENT_TYPES: LevelChangeEventType[] = [
  ...OUTCOMES_EVENT_TYPES,
  ...SOCIAL_EVENT_TYPES,
  LevelChangeEventType.LUNDA,
  LevelChangeEventType.OTHER,
];

export function eventTypesForRevertScope(scope: LevelChangeRevertScope): LevelChangeEventType[] {
  switch (scope) {
    case 'outcomes':
      return OUTCOMES_EVENT_TYPES;
    case 'social':
      return SOCIAL_EVENT_TYPES;
    case 'all':
      return ALL_GAME_LINKED_EVENT_TYPES;
  }
}

export function isSocialLevelRevertEventType(eventType: LevelChangeEventType): boolean {
  return (
    eventType === LevelChangeEventType.SOCIAL_PARTICIPANT ||
    eventType === LevelChangeEventType.SOCIAL_BAR
  );
}
