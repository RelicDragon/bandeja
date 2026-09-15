import { EVENT_MAX_HEROES } from '@shared/entityCapabilities';
import type {
  Club,
  EventKind,
  PriceCurrency,
  PriceType,
  Sport,
} from '@/types';

export type EventCreatorIntent = 'organizing' | 'looking';

export type EventHeroPayload = {
  originalUrl: string;
  thumbnailUrl: string;
};

export type CreateEventFormInput = {
  eventKind: EventKind | null;
  eventCreatorIntent: EventCreatorIntent | null;
  eventHeroes: EventHeroPayload[];
  venueText: string;
  externalUrl: string;
  sport: Sport;
  minLevel: number;
  maxLevel: number;
  name: string;
  description: string;
  cityId: string;
  clubId: string;
  startTime: Date;
  endTime: Date;
  priceTotal: number | undefined;
  priceType: PriceType;
  priceCurrency: PriceCurrency | undefined;
};

export type CreateEventPayload = {
  entityType: 'EVENT';
  eventKind: EventKind;
  eventCreatorIntent: EventCreatorIntent;
  eventHeroes: EventHeroPayload[];
  venueText: string | undefined;
  externalUrl: string | undefined;
  sport: Sport;
  minLevel: number;
  maxLevel: number;
  name: string | undefined;
  description: string | undefined;
  cityId: string;
  clubId: string | undefined;
  startTime: string;
  endTime: string;
  priceTotal: number | undefined;
  priceType: PriceType;
  priceCurrency: PriceCurrency | undefined;
  isPublic: true;
  allowDirectJoin: true;
  affectsRating: false;
  timeIsSet: true;
};

export function isPlayingClub(club: Pick<Club, 'isForPlaying' | 'isBar'>): boolean {
  return club.isForPlaying !== false && club.isBar !== true;
}

export function clampEventHeroes(heroes: EventHeroPayload[]): EventHeroPayload[] {
  return heroes.slice(0, EVENT_MAX_HEROES);
}

export function toDatetimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function fromDatetimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function defaultEventDateRange(initialStart?: string): { start: Date; end: Date } {
  if (initialStart) {
    const start = new Date(initialStart);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
      return { start, end };
    }
  }
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(18, 0, 0, 0);
  return { start, end };
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function createEventSubmitIssue(
  input: Pick<
    CreateEventFormInput,
    'eventKind' | 'eventCreatorIntent' | 'cityId' | 'startTime' | 'endTime' | 'name' | 'eventHeroes'
  >,
): 'intent' | 'kind' | 'city' | 'dates' | 'name' | 'heroes' | null {
  if (!input.eventCreatorIntent) return 'intent';
  if (!input.eventKind) return 'kind';
  if (!input.cityId) return 'city';
  if (
    Number.isNaN(input.startTime.getTime()) ||
    Number.isNaN(input.endTime.getTime()) ||
    input.endTime.getTime() <= input.startTime.getTime()
  ) {
    return 'dates';
  }
  if (!input.name.trim()) return 'name';
  if (input.eventHeroes.length < 1) return 'heroes';
  return null;
}

export function buildCreateEventPayload(input: CreateEventFormInput): CreateEventPayload {
  if (!input.eventKind) {
    throw new Error('eventKind is required');
  }
  if (!input.eventCreatorIntent) {
    throw new Error('eventCreatorIntent is required');
  }
  const priced = input.priceType !== 'NOT_KNOWN' && input.priceType !== 'FREE';
  return {
    entityType: 'EVENT',
    eventKind: input.eventKind,
    eventCreatorIntent: input.eventCreatorIntent,
    eventHeroes: clampEventHeroes(input.eventHeroes),
    venueText: input.clubId ? undefined : trimOrUndefined(input.venueText),
    externalUrl: trimOrUndefined(input.externalUrl),
    sport: input.sport,
    minLevel: input.minLevel,
    maxLevel: input.maxLevel,
    name: trimOrUndefined(input.name),
    description: trimOrUndefined(input.description),
    cityId: input.cityId,
    clubId: input.clubId || undefined,
    startTime: input.startTime.toISOString(),
    endTime: input.endTime.toISOString(),
    priceTotal: priced ? input.priceTotal : undefined,
    priceType: input.priceType,
    priceCurrency: priced ? input.priceCurrency : undefined,
    isPublic: true,
    allowDirectJoin: true,
    affectsRating: false,
    timeIsSet: true,
  };
}
