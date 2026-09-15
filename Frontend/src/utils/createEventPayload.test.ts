import { describe, expect, it } from 'vitest';
import {
  buildCreateEventPayload,
  clampEventHeroes,
  createEventSubmitIssue,
  defaultEventDateRange,
  fromDatetimeLocalValue,
  isPlayingClub,
  toDatetimeLocalValue,
  type CreateEventFormInput,
} from './createEventPayload';

const start = new Date('2026-09-20T09:00:00');
const end = new Date('2026-09-22T18:00:00');

function baseInput(overrides: Partial<CreateEventFormInput> = {}): CreateEventFormInput {
  return {
    eventKind: 'CAMP',
    eventCreatorIntent: 'looking',
    eventHeroes: [{ originalUrl: 'https://cdn.example/o.jpg', thumbnailUrl: 'https://cdn.example/t.jpg' }],
    venueText: '  Hall A  ',
    externalUrl: ' https://example.com/register ',
    sport: 'PADEL',
    minLevel: 2.3,
    maxLevel: 3.7,
    name: '  Open camp  ',
    description: '  Bring shoes  ',
    cityId: 'city-1',
    clubId: '',
    startTime: start,
    endTime: end,
    priceTotal: 40,
    priceType: 'PER_PERSON',
    priceCurrency: 'EUR',
    ...overrides,
  };
}

describe('buildCreateEventPayload', () => {
  it('posts a public EVENT listing with trimmed fields and listing flags', () => {
    const payload = buildCreateEventPayload(baseInput());
    expect(payload).toMatchObject({
      entityType: 'EVENT',
      eventKind: 'CAMP',
      eventCreatorIntent: 'looking',
      venueText: 'Hall A',
      externalUrl: 'https://example.com/register',
      name: 'Open camp',
      description: 'Bring shoes',
      cityId: 'city-1',
      clubId: undefined,
      minLevel: 2.3,
      maxLevel: 3.7,
      priceTotal: 40,
      priceType: 'PER_PERSON',
      priceCurrency: 'EUR',
      isPublic: true,
      allowDirectJoin: true,
      affectsRating: false,
      timeIsSet: true,
    });
    expect(payload.startTime).toBe(start.toISOString());
    expect(payload.endTime).toBe(end.toISOString());
    expect(payload.eventHeroes).toHaveLength(1);
  });

  it('drops venueText when clubId is set', () => {
    const payload = buildCreateEventPayload(baseInput({ clubId: 'club-9', venueText: 'Hall A' }));
    expect(payload.clubId).toBe('club-9');
    expect(payload.venueText).toBeUndefined();
  });

  it('keeps optional club and drops empty venue/url/description', () => {
    const payload = buildCreateEventPayload(
      baseInput({ clubId: 'club-9', venueText: '   ', externalUrl: '', description: '' }),
    );
    expect(payload.clubId).toBe('club-9');
    expect(payload.venueText).toBeUndefined();
    expect(payload.externalUrl).toBeUndefined();
    expect(payload.description).toBeUndefined();
    expect(payload.name).toBe('Open camp');
  });

  it('omits amount and currency when price is free', () => {
    const payload = buildCreateEventPayload(
      baseInput({ priceType: 'FREE', priceTotal: 10, priceCurrency: 'EUR' }),
    );
    expect(payload.priceType).toBe('FREE');
    expect(payload.priceTotal).toBeUndefined();
    expect(payload.priceCurrency).toBeUndefined();
  });
});

describe('createEventSubmitIssue', () => {
  it('requires intent, kind, city, dates, name, and at least one hero', () => {
    expect(
      createEventSubmitIssue({
        eventKind: null,
        eventCreatorIntent: null,
        cityId: '',
        startTime: start,
        endTime: end,
        name: '',
        eventHeroes: [],
      }),
    ).toBe('intent');
    expect(
      createEventSubmitIssue({
        eventKind: null,
        eventCreatorIntent: 'organizing',
        cityId: '',
        startTime: start,
        endTime: end,
        name: '',
        eventHeroes: [],
      }),
    ).toBe('kind');
    expect(
      createEventSubmitIssue({
        eventKind: 'TOURNAMENT',
        eventCreatorIntent: 'organizing',
        cityId: '',
        startTime: start,
        endTime: end,
        name: '',
        eventHeroes: [],
      }),
    ).toBe('city');
    expect(
      createEventSubmitIssue({
        eventKind: 'TOURNAMENT',
        eventCreatorIntent: 'organizing',
        cityId: 'c1',
        startTime: end,
        endTime: start,
        name: 'Open',
        eventHeroes: [{ originalUrl: 'o', thumbnailUrl: 't' }],
      }),
    ).toBe('dates');
    expect(
      createEventSubmitIssue({
        eventKind: 'TOURNAMENT',
        eventCreatorIntent: 'organizing',
        cityId: 'c1',
        startTime: start,
        endTime: end,
        name: '',
        eventHeroes: [{ originalUrl: 'o', thumbnailUrl: 't' }],
      }),
    ).toBe('name');
    expect(
      createEventSubmitIssue({
        eventKind: 'TOURNAMENT',
        eventCreatorIntent: 'organizing',
        cityId: 'c1',
        startTime: start,
        endTime: end,
        name: 'Open',
        eventHeroes: [],
      }),
    ).toBe('heroes');
    expect(
      createEventSubmitIssue({
        eventKind: 'TOURNAMENT',
        eventCreatorIntent: 'organizing',
        cityId: 'c1',
        startTime: start,
        endTime: end,
        name: 'Open',
        eventHeroes: [{ originalUrl: 'o', thumbnailUrl: 't' }],
      }),
    ).toBeNull();
  });
});

describe('event helpers', () => {
  it('keeps playing clubs and drops bars', () => {
    expect(isPlayingClub({ isForPlaying: true, isBar: false })).toBe(true);
    expect(isPlayingClub({})).toBe(true);
    expect(isPlayingClub({ isForPlaying: false })).toBe(false);
    expect(isPlayingClub({ isBar: true })).toBe(false);
  });

  it('caps hero images at 8', () => {
    const heroes = Array.from({ length: 10 }, (_, i) => ({
      originalUrl: `o${i}`,
      thumbnailUrl: `t${i}`,
    }));
    expect(clampEventHeroes(heroes)).toHaveLength(8);
  });

  it('round-trips datetime-local values', () => {
    const value = toDatetimeLocalValue(start);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const parsed = fromDatetimeLocalValue(value);
    expect(parsed?.getTime()).toBe(start.getTime());
  });

  it('defaults an 8-hour window from an initial start', () => {
    const range = defaultEventDateRange('2026-09-20T10:00:00');
    expect(range.end.getTime() - range.start.getTime()).toBe(8 * 60 * 60 * 1000);
  });
});
