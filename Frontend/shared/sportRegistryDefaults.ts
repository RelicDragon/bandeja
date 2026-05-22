import { Sports, ALL_SPORTS, type Sport } from './sport';

/** Canonical default match sizes — keep in sync with Backend + Frontend sportRegistry. */
export const DEFAULT_PLAYERS_PER_MATCH_BY_SPORT: Record<Sport, 2 | 4> = {
  [Sports.PADEL]: 4,
  [Sports.TENNIS]: 2,
  [Sports.PICKLEBALL]: 2,
  [Sports.BADMINTON]: 2,
  [Sports.TABLE_TENNIS]: 2,
  [Sports.SQUASH]: 2,
};

for (const sport of ALL_SPORTS) {
  if (DEFAULT_PLAYERS_PER_MATCH_BY_SPORT[sport] == null) {
    throw new Error(`DEFAULT_PLAYERS_PER_MATCH_BY_SPORT missing ${sport}`);
  }
}
