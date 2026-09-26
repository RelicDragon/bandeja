import type { BasicUser } from '@/types';

/** First names of a side, e.g. "Ana · Leo". */
export const teamLabel = (players: BasicUser[]) =>
  players
    .map((p) => p.firstName || p.lastName || '?')
    .join(' · ');
