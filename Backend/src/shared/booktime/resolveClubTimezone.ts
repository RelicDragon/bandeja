import prisma from '../../config/database';
import { BOOKTIME_DEFAULT_TIMEZONE } from './localTime';

export async function resolveBooktimeTimezoneFromCityId(
  cityId: string | null | undefined,
): Promise<string> {
  if (!cityId) return BOOKTIME_DEFAULT_TIMEZONE;
  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: { timezone: true },
  });
  return city?.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
}

export async function resolveBooktimeTimezoneFromClubId(
  clubId: string | null | undefined,
): Promise<string> {
  if (!clubId) return BOOKTIME_DEFAULT_TIMEZONE;
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { city: { select: { timezone: true } } },
  });
  return club?.city?.timezone ?? BOOKTIME_DEFAULT_TIMEZONE;
}

export async function resolveBooktimeTimezoneForGame(gameId: string): Promise<string> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { cityId: true, clubId: true },
  });
  if (!game) return BOOKTIME_DEFAULT_TIMEZONE;
  if (game.cityId) return resolveBooktimeTimezoneFromCityId(game.cityId);
  return resolveBooktimeTimezoneFromClubId(game.clubId);
}
