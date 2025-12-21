import { get, set } from 'idb-keyval';

const GROUP_FILTER_PREFIX = 'padelpulse-group-filter';

export const getGroupFilter = async (leagueSeasonId: string): Promise<string | null> => {
  const key = `${GROUP_FILTER_PREFIX}:${leagueSeasonId}`;
  return await get<string>(key) || null;
};

export const setGroupFilter = async (leagueSeasonId: string, groupId: string): Promise<void> => {
  const key = `${GROUP_FILTER_PREFIX}:${leagueSeasonId}`;
  await set(key, groupId);
};

