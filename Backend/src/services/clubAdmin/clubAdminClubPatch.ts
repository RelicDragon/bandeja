import { Prisma } from '@prisma/client';
import { isClubTime } from '@bandeja/shared/clubAdmin/clubTime';
import prisma from '../../config/database';
import { normalizeClubName } from '../../utils/normalizeClubName';
import { parseClubPhotosJson, type ClubPhotoStored } from '../../utils/clubPhotosJson';
import { parseClubSportsInput, assertClubSportsCoverCourtSports } from '../../shared/clubSports';
import { clubAdminValidation } from './clubAdminErrors';

/**
 * Typed validation for every club-admin write to `Club` (legacy `PATCH /clubs/:clubId` and
 * v2 `PATCH /profile`). Unknown keys are ignored by the caller's whitelist; every known key
 * is type-checked here and nothing is written raw.
 */

function text(raw: unknown, field: string, opts: { max: number; required?: boolean }): string | null {
  if (raw === null) {
    if (opts.required) throw clubAdminValidation(field, 'is required');
    return null;
  }
  if (typeof raw !== 'string') throw clubAdminValidation(field, 'must be a string');
  const v = raw.trim();
  if (!v) {
    if (opts.required) throw clubAdminValidation(field, 'is required');
    return null;
  }
  if (v.length > opts.max) throw clubAdminValidation(field, `must be at most ${opts.max} characters`);
  return v;
}

function intInRange(raw: unknown, field: string, min: number, max: number): number | null {
  if (raw === null) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < min || raw > max) {
    throw clubAdminValidation(field, `must be an integer between ${min} and ${max}`);
  }
  return raw;
}

function coordinate(raw: unknown, field: string, limit: number): number | null {
  if (raw === null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.abs(raw) > limit) {
    throw clubAdminValidation(field, `must be a number within ±${limit}`);
  }
  return raw;
}

function stringList(raw: unknown, field: string, maxItems: number, maxLen: number): string[] | null {
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length > maxItems) throw clubAdminValidation(field, `must be a list of at most ${maxItems}`);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim() || item.length > maxLen) {
      throw clubAdminValidation(field, 'must contain non-empty strings');
    }
    if (!out.includes(item.trim())) out.push(item.trim());
  }
  return out;
}

/**
 * Photos can only be reordered or removed here; uploads go through `POST /media/upload/club/photo`.
 * Items are either the stored `{ originalUrl, thumbnailUrl }` or a bare `originalUrl` string; each
 * must name a photo the club already has.
 */
export function resolveClubPhotosPatch(raw: unknown, existingJson: unknown): ClubPhotoStored[] {
  if (!Array.isArray(raw)) throw clubAdminValidation('photos', 'must be an array');
  const existing = parseClubPhotosJson(existingJson);
  const byOriginal = new Map(existing.map((p) => [p.originalUrl, p]));
  const out: ClubPhotoStored[] = [];
  for (const item of raw) {
    const url =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object' && typeof (item as { originalUrl?: unknown }).originalUrl === 'string'
          ? (item as { originalUrl: string }).originalUrl
          : null;
    if (url === null) throw clubAdminValidation('photos', 'must be photo URLs');
    const stored = byOriginal.get(url);
    if (!stored) throw clubAdminValidation('photos', 'unknown photo; upload it first');
    if (!out.includes(stored)) out.push(stored);
  }
  return out;
}

export const CLUB_PATCH_KEYS = [
  'name',
  'description',
  'phone',
  'email',
  'website',
  'address',
  'openingTime',
  'closingTime',
  'amenities',
  'latitude',
  'longitude',
  'defaultSlotMinutes',
  'cancellationNoticeHours',
  'policyText',
  'photos',
  'sports',
] as const;

export type ClubPatchKey = (typeof CLUB_PATCH_KEYS)[number];

/** Validates `body` (only `allowedKeys`) into a Prisma update for `clubId`. */
export async function buildClubPatchData(
  clubId: string,
  body: Record<string, unknown>,
  allowedKeys: readonly string[] = CLUB_PATCH_KEYS
): Promise<Prisma.ClubUncheckedUpdateInput> {
  const has = (k: string) => allowedKeys.includes(k) && body[k] !== undefined;
  const data: Prisma.ClubUncheckedUpdateInput = {};

  if (has('name')) {
    const name = text(body.name, 'name', { max: 200, required: true })!;
    data.name = name;
    data.normalizedName = normalizeClubName(name);
  }
  if (has('description')) data.description = text(body.description, 'description', { max: 5000 });
  if (has('phone')) data.phone = text(body.phone, 'phone', { max: 64 });
  if (has('email')) {
    const email = text(body.email, 'email', { max: 200 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw clubAdminValidation('email', 'is not an email address');
    data.email = email;
  }
  if (has('website')) {
    const website = text(body.website, 'website', { max: 500 });
    if (website && !/^https?:\/\/\S+$/i.test(website)) throw clubAdminValidation('website', 'must start with http(s)://');
    data.website = website;
  }
  if (has('address')) data.address = text(body.address, 'address', { max: 500, required: true })!;
  for (const key of ['openingTime', 'closingTime'] as const) {
    if (!has(key)) continue;
    const v = body[key];
    if (v !== null && !isClubTime(v)) throw clubAdminValidation(key, 'must be HH:mm');
    data[key] = v as string | null;
  }
  if (has('amenities')) {
    const amenities = stringList(body.amenities, 'amenities', 50, 100);
    data.amenities = amenities === null ? Prisma.DbNull : amenities;
  }
  if (has('latitude')) data.latitude = coordinate(body.latitude, 'latitude', 90);
  if (has('longitude')) data.longitude = coordinate(body.longitude, 'longitude', 180);
  if (has('defaultSlotMinutes')) data.defaultSlotMinutes = intInRange(body.defaultSlotMinutes, 'defaultSlotMinutes', 5, 240);
  if (has('cancellationNoticeHours')) {
    data.cancellationNoticeHours = intInRange(body.cancellationNoticeHours, 'cancellationNoticeHours', 0, 720);
  }
  if (has('policyText')) data.policyText = text(body.policyText, 'policyText', { max: 5000 });

  if (has('photos') || has('sports')) {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { photos: true } });
    if (has('photos')) data.photos = resolveClubPhotosPatch(body.photos, club?.photos) as unknown as Prisma.InputJsonValue;
    if (has('sports')) {
      const courts = await prisma.court.findMany({ where: { clubId }, select: { sport: true } });
      try {
        const sports = parseClubSportsInput(body.sports);
        assertClubSportsCoverCourtSports(
          sports,
          courts.map((c) => c.sport)
        );
        data.sports = sports;
      } catch (err) {
        throw clubAdminValidation('sports', err instanceof Error ? err.message : 'invalid');
      }
    }
  }
  return data;
}
