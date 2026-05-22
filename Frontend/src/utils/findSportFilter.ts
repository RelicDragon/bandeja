import { DEFAULT_SPORT, type Sport } from '@shared/sport';
import type { FindSportFilterValue, GameFilters } from '@/utils/gameFiltersStorage';
import {
  getUserPrimarySport,
  listEnabledSports,
  resolveActivePrimarySport,
} from '@/utils/profileSports';
import type { User } from '@/types';

export type FindSportFilter = GameFilters['filterSport'];

export function normalizeFindSportFilter(value: FindSportFilter | undefined): FindSportFilterValue {
  if (value === undefined || value === 'primary') return 'primary';
  return value;
}

export function isFindSportFilterActive(
  filterSport: FindSportFilter | undefined,
  primarySport: Sport,
): boolean {
  const f = normalizeFindSportFilter(filterSport);
  if (f === 'all') return true;
  if (f !== 'primary' && f !== primarySport) return true;
  return false;
}

/** Query param for GET /games/available — omit when default primary. */
export function findSportFilterToApiParam(
  filterSport: FindSportFilter | undefined,
  primarySport: Sport,
): string | undefined {
  const f = normalizeFindSportFilter(filterSport);
  if (f === 'all') return 'all';
  if (f !== 'primary' && f !== primarySport) return f;
  return undefined;
}

export function shouldShowFindSportFilterSection(user: User | null | undefined): boolean {
  if (listEnabledSports(user).length >= 2) return true;
  const played = user?.sportsPlayed;
  return !!played && Object.keys(played).length > 0;
}

export function shouldShowGameCardSportGlyph(
  gameSport: Sport | null | undefined,
  viewerPrimarySport: Sport,
  findFilterSport: FindSportFilter | undefined,
): boolean {
  const sport = gameSport ?? DEFAULT_SPORT;
  if (normalizeFindSportFilter(findFilterSport) === 'all') return true;
  return sport !== viewerPrimarySport;
}

export function getViewerPrimarySport(user: User | null | undefined): Sport {
  return resolveActivePrimarySport(user) ?? getUserPrimarySport(user);
}

/** Sport whose profile level applies to Find "my level" filters (primary or explicit filter). */
export function resolveFindLevelFilterSport(
  filterSport: FindSportFilter | undefined,
  viewerPrimarySport: Sport,
): Sport {
  const f = normalizeFindSportFilter(filterSport);
  if (f === 'all' || f === 'primary') return viewerPrimarySport;
  return f;
}
