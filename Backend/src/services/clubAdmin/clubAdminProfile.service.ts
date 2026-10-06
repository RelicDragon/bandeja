import { PriceCurrency } from '@prisma/client';
import type { ClubProfile } from '@bandeja/shared/clubAdmin/contract';
import { clubHasBookingIntegration } from '@bandeja/shared/clubIntegration';
import prisma from '../../config/database';
import { parseClubPhotosJson } from '../../utils/clubPhotosJson';
import { amenitiesToList, buildClubPatchData } from './clubAdminClubPatch';
import { clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';
import { logClubActivity } from './clubAdminActivity.service';
import { DEFAULT_SLOT_MINUTES } from './clubAdminSchedule.service';

/** Keys of `PatchClubProfileBody`; `currency` is validated here, the rest by `buildClubPatchData`. */
const PROFILE_PATCH_KEYS = [
  'name',
  'description',
  'phone',
  'email',
  'website',
  'address',
  'latitude',
  'longitude',
  'amenities',
  'sports',
  'policyText',
  'defaultSlotMinutes',
  'cancellationNoticeHours',
  'photos',
] as const;

/** `photos` are the stored originals' URLs; PATCH may only reorder/remove them. */
export async function getClubProfile(clubId: string): Promise<ClubProfile> {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) throw clubAdminNotFound('Club');
  return {
    id: club.id,
    name: club.name,
    description: club.description,
    avatar: club.avatar,
    photos: parseClubPhotosJson(club.photos).map((p) => p.originalUrl),
    phone: club.phone,
    email: club.email,
    website: club.website,
    address: club.address,
    latitude: club.latitude,
    longitude: club.longitude,
    amenities: amenitiesToList(club.amenities),
    sports: club.sports,
    policyText: club.policyText,
    defaultSlotMinutes: club.defaultSlotMinutes ?? DEFAULT_SLOT_MINUTES,
    cancellationNoticeHours: club.cancellationNoticeHours,
    currency: club.currency,
    integrationType: club.integrationType,
    // Health = the config parses (never the config itself).
    integrationHealthy: club.integrationType
      ? clubHasBookingIntegration({ integrationType: club.integrationType, integrationConfig: club.integrationConfig })
      : null,
  };
}

export async function patchClubProfile(userId: string, clubId: string, body: Record<string, unknown>): Promise<ClubProfile> {
  const data = await buildClubPatchData(clubId, body ?? {}, PROFILE_PATCH_KEYS);
  if (body?.currency !== undefined) {
    if (typeof body.currency !== 'string' || !(Object.values(PriceCurrency) as string[]).includes(body.currency)) {
      throw clubAdminValidation('currency', 'unknown currency');
    }
    data.currency = body.currency as PriceCurrency;
  }
  const fields = Object.keys(data).filter((k) => k !== 'normalizedName');
  if (fields.length === 0) throw clubAdminValidation('body', 'No valid fields to update');
  await prisma.club.update({ where: { id: clubId }, data });
  await logClubActivity(clubId, userId, 'CLUB_UPDATED', { fields: fields.join(',') });
  return getClubProfile(clubId);
}
