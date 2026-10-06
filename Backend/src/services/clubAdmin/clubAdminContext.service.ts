import type { ClubAdminContext, ClubSetupChecklist } from '@bandeja/shared/clubAdmin/contract';
import { clubLocalDate } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import type { ClubAdminRequestContext } from '../../middleware/clubAdminContext';
import { parseClubPhotosJson } from '../../utils/clubPhotosJson';

export async function getSetupChecklist(clubId: string): Promise<ClubSetupChecklist> {
  const [club, activeCourts, weeklyRows, priceRules, pricedCourts] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: { photos: true, phone: true, email: true, website: true, openingTime: true, closingTime: true },
    }),
    prisma.court.count({ where: { clubId, isActive: true } }),
    prisma.clubWeeklyHours.count({ where: { clubId } }),
    prisma.clubPriceRule.count({ where: { clubId } }),
    prisma.court.count({ where: { clubId, isActive: true, pricePerHour: { not: null } } }),
  ]);
  return {
    hasCourts: activeCourts > 0,
    hasHours: weeklyRows > 0 || Boolean(club?.openingTime && club?.closingTime),
    hasPrices: priceRules > 0 || pricedCourts > 0,
    hasPhotos: parseClubPhotosJson(club?.photos).length > 0,
    hasContacts: Boolean(club?.phone || club?.email || club?.website),
  };
}

export function missingSetup(setup: ClubSetupChecklist): Array<keyof ClubSetupChecklist> {
  return (Object.keys(setup) as Array<keyof ClubSetupChecklist>).filter((k) => !setup[k]);
}

export async function getClubAdminContextPayload(ctx: ClubAdminRequestContext): Promise<ClubAdminContext> {
  return {
    club: {
      id: ctx.club.id,
      name: ctx.club.name,
      avatar: ctx.club.avatar,
      cityName: ctx.club.cityName,
      timezone: ctx.timezone,
      currency: ctx.currency,
      integrationType: ctx.club.integrationType,
      isActive: ctx.club.isActive,
    },
    role: ctx.role,
    capabilities: [...ctx.capabilities],
    today: clubLocalDate(new Date(), ctx.timezone),
    setup: await getSetupChecklist(ctx.clubId),
  };
}
