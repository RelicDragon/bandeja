import type { Sport } from '@shared/sport';
import type { Club, Game, User } from '@/types';
import { parseGameSport } from '@/utils/gameSport';
import { getDisplayLevelForSport } from '@/utils/profileSports';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import { normalizeFindSportFilter } from '@/utils/findSportFilter';

export function passesFindAvailableSlotsFilter(game: Game, user: User | null | undefined): boolean {
  const slotCount = game.participants.filter((p) => p.status === 'PLAYING').length;
  if (slotCount >= game.maxParticipants) {
    return false;
  }

  const genderTeams = game.genderTeams ?? 'ANY';
  if (genderTeams !== 'ANY' && user?.gender === 'PREFER_NOT_TO_SAY') {
    return false;
  }

  if (genderTeams !== 'ANY' && user?.gender) {
    if (user.gender === 'PREFER_NOT_TO_SAY') {
      return false;
    }
    if (genderTeams === 'MEN' && user.gender !== 'MALE') return false;
    if (genderTeams === 'WOMEN' && user.gender !== 'FEMALE') return false;
    if (genderTeams === 'MIX_PAIRS') {
      if (user.gender !== 'MALE' && user.gender !== 'FEMALE') return false;
      const playing = game.participants?.filter((p) => p.status === 'PLAYING') ?? [];
      const maxPerGender = Math.floor((game.maxParticipants || 0) / 2);
      const sameGenderCount = playing.filter((p) => p.user?.gender === user.gender).length;
      if (sameGenderCount >= maxPerGender) return false;
    }
  }

  return true;
}

export function passesFindSuitableRatingFilter(game: Game, user: User | null | undefined): boolean {
  if (!user) return true;

  const gameSport = parseGameSport(game.sport);
  const userLevel = getDisplayLevelForSport(user, gameSport);
  const minLevel = game.minLevel || 0;
  const maxLevel = game.maxLevel || 10;

  return userLevel >= minLevel && userLevel <= maxLevel;
}

export function passesFindHideBarGamesFilter(game: Game, hideBarGames: boolean | undefined): boolean {
  if (!hideBarGames) return true;
  return game.entityType !== 'BAR';
}

export function resolveFindClubSportFilter(
  filterSport: FindSportFilterValue | undefined,
  viewerPrimarySport: Sport,
): Sport | null {
  const f = normalizeFindSportFilter(filterSport);
  if (f === 'all') return null;
  return f === 'primary' ? viewerPrimarySport : f;
}

export function clubMatchesFindSportFilter(
  club: Club,
  filterSport: FindSportFilterValue | undefined,
  viewerPrimarySport: Sport,
): boolean {
  const sport = resolveFindClubSportFilter(filterSport, viewerPrimarySport);
  if (!sport) return true;

  const sports = club.sports;
  if (!sports || sports.length === 0) return true;
  return sports.includes(sport);
}
