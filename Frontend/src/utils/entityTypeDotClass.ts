import type { FindDisplayEntityType } from '@/utils/findFilter';

export const ENTITY_TYPE_DOT_CLASS: Record<FindDisplayEntityType, string> = {
  GAME: 'bg-gray-700 dark:bg-gray-200',
  TOURNAMENT: 'bg-red-500',
  TRAINING: 'bg-green-500',
  LEAGUE: 'bg-blue-500',
  BAR: 'bg-yellow-400',
};

export const ENTITY_TYPE_DOT_INVERTED_CLASS: Record<FindDisplayEntityType, string> = {
  GAME: 'bg-white',
  TOURNAMENT: 'bg-red-300',
  TRAINING: 'bg-green-300',
  LEAGUE: 'bg-blue-200',
  BAR: 'bg-yellow-300',
};
