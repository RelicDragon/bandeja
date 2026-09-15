import { EventKind, Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import {
  EVENT_KINDS,
  EVENT_MAX_HEROES,
  EVENT_UNBOUNDED_ROSTER,
} from '@bandeja/shared/entityCapabilities';

export type EventCreatorIntent = 'organizing' | 'looking';

export type EventHeroInput = {
  originalUrl: string;
  thumbnailUrl: string;
};

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value);
}

function parseEventHeroes(raw: unknown): EventHeroInput[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'eventHeroes must be an array');
  }
  if (raw.length > EVENT_MAX_HEROES) {
    throw new ApiError(400, `At most ${EVENT_MAX_HEROES} event images are allowed`);
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, `eventHeroes[${index}] is invalid`);
    }
    const originalUrl = String((item as EventHeroInput).originalUrl ?? '').trim();
    const thumbnailUrl = String((item as EventHeroInput).thumbnailUrl ?? '').trim();
    if (!originalUrl || !thumbnailUrl) {
      throw new ApiError(400, `eventHeroes[${index}] requires originalUrl and thumbnailUrl`);
    }
    return { originalUrl, thumbnailUrl };
  });
}

export function parseEventCreatorIntent(raw: unknown): EventCreatorIntent {
  return raw === 'looking' ? 'looking' : 'organizing';
}

export function assertEventCreatePayload(data: {
  eventKind?: unknown;
  externalUrl?: unknown;
  venueText?: unknown;
  eventHeroes?: unknown;
  clubId?: unknown;
  cityId?: unknown;
  name?: unknown;
}) {
  if (!isEventKind(data.eventKind)) {
    throw new ApiError(400, 'eventKind is required (TOURNAMENT, LEAGUE, or CAMP)');
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new ApiError(400, 'name is required');
  }
  const heroes = parseEventHeroes(data.eventHeroes);
  if (heroes.length < 1) {
    throw new ApiError(400, 'At least one event image is required');
  }
  if (data.externalUrl != null && data.externalUrl !== '') {
    const url = String(data.externalUrl);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('bad protocol');
      }
    } catch {
      throw new ApiError(400, 'externalUrl must be an http(s) URL');
    }
  }
  applyEventUpdateInvariants(data as Record<string, unknown>);
}

export function applyEventUpdateInvariants(data: Record<string, unknown>) {
  const courtId = data.courtId;
  if (courtId != null && courtId !== '' && courtId !== 'notBooked') {
    throw new ApiError(400, 'EVENT listings cannot have courts');
  }
  if (Array.isArray(data.courtIds) && data.courtIds.length > 0) {
    throw new ApiError(400, 'EVENT listings cannot have courts');
  }
  if (data.hasBookedCourt === true) {
    throw new ApiError(400, 'EVENT listings cannot book courts');
  }
  if (data.bookingIds != null || data.linkedBookingIds != null) {
    throw new ApiError(400, 'EVENT listings cannot link bookings');
  }
  if (Array.isArray(data.externalBookingIds) && data.externalBookingIds.length > 0) {
    throw new ApiError(400, 'EVENT listings cannot link bookings');
  }
  if (data.externalBookingProvider != null && data.externalBookingProvider !== '') {
    throw new ApiError(400, 'EVENT listings cannot link bookings');
  }
  if (data.anyoneCanInvite === true) {
    throw new ApiError(400, 'EVENT listings cannot use invites');
  }
  if (data.timeIsSet === false) {
    throw new ApiError(400, 'EVENT listings must have a time set');
  }
  if (data.affectsRating === true) {
    throw new ApiError(400, 'EVENT listings cannot affect rating');
  }
  if (data.resultsByAnyone === true) {
    throw new ApiError(400, 'EVENT listings cannot have results');
  }
  if (data.eventKind !== undefined && !isEventKind(data.eventKind)) {
    throw new ApiError(400, 'eventKind is required (TOURNAMENT, LEAGUE, or CAMP)');
  }
  if (data.externalUrl != null && data.externalUrl !== '') {
    const url = String(data.externalUrl);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('bad protocol');
      }
    } catch {
      throw new ApiError(400, 'externalUrl must be an http(s) URL');
    }
  }
  if (typeof data.venueText === 'string') {
    data.venueText = data.venueText.trim() || null;
  }
  if (typeof data.externalUrl === 'string') {
    data.externalUrl = data.externalUrl.trim() || null;
  }
}

export function eventCreateDefaults(data: {
  eventKind: unknown;
  venueText?: unknown;
  externalUrl?: unknown;
  eventHeroes?: unknown;
  eventCreatorIntent?: unknown;
  name?: unknown;
  description?: unknown;
  avatar?: unknown;
  originalAvatar?: unknown;
  minLevel?: number | null;
  maxLevel?: number | null;
  cityId: string;
  clubId?: string | null;
  startTime: Date;
  endTime: Date;
  sport: string;
  priceTotal?: number | null;
  priceType?: string;
  priceCurrency?: string | null;
}): {
  gameData: Prisma.GameCreateInput;
  ownerLooking: boolean;
  heroes: EventHeroInput[];
} {
  const intent = parseEventCreatorIntent(data.eventCreatorIntent);
  const ownerLooking = intent === 'looking';
  const heroes = parseEventHeroes(data.eventHeroes);
  const venueText =
    typeof data.venueText === 'string' && data.venueText.trim() ? data.venueText.trim() : null;
  const externalUrl =
    typeof data.externalUrl === 'string' && data.externalUrl.trim() ? data.externalUrl.trim() : null;

  return {
    ownerLooking,
    heroes,
    gameData: {
      entityType: 'EVENT',
      eventKind: data.eventKind as EventKind,
      sport: data.sport as Prisma.GameCreateInput['sport'],
      gameType: 'CLASSIC',
      name: typeof data.name === 'string' ? data.name : null,
      description: typeof data.description === 'string' ? data.description : null,
      avatar: typeof data.avatar === 'string' ? data.avatar : null,
      originalAvatar: typeof data.originalAvatar === 'string' ? data.originalAvatar : null,
      city: { connect: { id: data.cityId } },
      ...(data.clubId ? { club: { connect: { id: data.clubId } } } : {}),
      startTime: data.startTime,
      endTime: data.endTime,
      maxParticipants: EVENT_UNBOUNDED_ROSTER,
      playersPerMatch: 4,
      minParticipants: 1,
      minLevel: data.minLevel ?? null,
      maxLevel: data.maxLevel ?? null,
      isPublic: true,
      eventApprovalStatus: 'ON_APPROVE',
      affectsRating: false,
      anyoneCanInvite: false,
      resultsByAnyone: false,
      allowDirectJoin: true,
      hasBookedCourt: false,
      genderTeams: 'ANY',
      timeIsSet: true,
      venueText,
      externalUrl,
      priceTotal: data.priceTotal ?? null,
      priceType: (data.priceType as Prisma.GameCreateInput['priceType']) ?? 'NOT_KNOWN',
      priceCurrency: (data.priceCurrency as Prisma.GameCreateInput['priceCurrency']) ?? null,
    },
  };
}

export function eventHeroCreates(heroes: EventHeroInput[]): Prisma.GameEventHeroCreateWithoutGameInput[] {
  return heroes.map((hero, sortOrder) => ({
    originalUrl: hero.originalUrl,
    thumbnailUrl: hero.thumbnailUrl,
    sortOrder,
  }));
}
