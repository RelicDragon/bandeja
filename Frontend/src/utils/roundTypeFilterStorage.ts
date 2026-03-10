import { get, set } from 'idb-keyval';

const ROUND_TYPE_FILTER_PREFIX = 'padelpulse-round-type-filter';

export type RoundTypeFilterValue = 'REGULAR' | 'PLAYOFF';

export const getRoundTypeFilter = async (leagueSeasonId: string): Promise<RoundTypeFilterValue | null> => {
  const key = `${ROUND_TYPE_FILTER_PREFIX}:${leagueSeasonId}`;
  const val = await get<string>(key);
  return val === 'REGULAR' || val === 'PLAYOFF' ? (val as RoundTypeFilterValue) : null;
};

export const setRoundTypeFilter = async (leagueSeasonId: string, value: RoundTypeFilterValue): Promise<void> => {
  const key = `${ROUND_TYPE_FILTER_PREFIX}:${leagueSeasonId}`;
  await set(key, value);
};
