import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Game } from '@/types';
import {
  resolveDaySeedFromMonthPage,
  seedDayScopedAvailableCache,
  type DaySeedRange,
} from './seedDayScopedAvailableCache';
import type { AvailableGamesPage } from './availableGamesPage';
import { availableGamesQueryOptions } from './useAvailableGamesQuery';

function sampleGame(id: string, startTime: string): Game {
  return { id, startTime } as Game;
}

function indexRow(id: string, startTime: string) {
  return {
    id,
    startTime,
    entityType: 'GAME',
    minLevel: null,
    maxLevel: null,
    maxParticipants: 4,
    genderTeams: 'ANY',
    trainerId: null,
    clubId: null,
    isPublic: true,
    timeIsSet: true,
    ownerUserId: null,
  };
}

const JUNE: DaySeedRange = { startKey: '2026-06-01', endKey: '2026-06-30' };

describe('resolveDaySeedFromMonthPage', () => {
  it('seeds empty when dayIndex confirms no games that day', () => {
    const page: AvailableGamesPage = {
      games: [],
      meta: {
        take: 0,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [indexRow('g1', '2026-06-10T10:00:00.000Z')],
        dayIndexTruncated: false,
      },
    };
    expect(resolveDaySeedFromMonthPage(page, '2026-06-15', null, JUNE)).toEqual([]);
  });

  it('returns null for days outside the month index window (no false empty)', () => {
    const page: AvailableGamesPage = {
      games: [],
      meta: {
        take: 0,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [],
        dayIndexTruncated: false,
      },
    };
    expect(resolveDaySeedFromMonthPage(page, '2026-07-01', null, JUNE)).toBeNull();
  });

  it('returns null for indexOnly month when day has index rows (no cards)', () => {
    const page: AvailableGamesPage = {
      games: [],
      meta: {
        take: 0,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [indexRow('g1', '2026-06-15T10:00:00.000Z')],
        dayIndexTruncated: false,
      },
    };
    expect(resolveDaySeedFromMonthPage(page, '2026-06-15', null, JUNE)).toBeNull();
  });

  it('seeds cards when month cards cover all dayIndex ids for the day', () => {
    const g1 = sampleGame('g1', '2026-06-15T10:00:00.000Z');
    const page: AvailableGamesPage = {
      games: [g1, sampleGame('g2', '2026-06-16T10:00:00.000Z')],
      meta: {
        take: 300,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [
          indexRow('g1', '2026-06-15T10:00:00.000Z'),
          indexRow('g2', '2026-06-16T10:00:00.000Z'),
        ],
        dayIndexTruncated: false,
      },
    };
    expect(resolveDaySeedFromMonthPage(page, '2026-06-15', null, JUNE)).toEqual([g1]);
  });

  it('returns null when dayIndex row missing from month cards', () => {
    const page: AvailableGamesPage = {
      games: [sampleGame('g1', '2026-06-15T10:00:00.000Z')],
      meta: {
        take: 300,
        bound: 300,
        hasMore: true,
        nextCursor: 'c',
        truncated: true,
        dayIndex: [
          indexRow('g1', '2026-06-15T10:00:00.000Z'),
          indexRow('g-missing', '2026-06-15T12:00:00.000Z'),
        ],
        dayIndexTruncated: false,
      },
    };
    expect(resolveDaySeedFromMonthPage(page, '2026-06-15', null, JUNE)).toBeNull();
  });
});

describe('seedDayScopedAvailableCache', () => {
  it('writes empty day page into day-scoped query key', () => {
    const client = new QueryClient();
    const monthPage: AvailableGamesPage = {
      games: [],
      meta: {
        take: 0,
        bound: 300,
        hasMore: false,
        nextCursor: null,
        truncated: false,
        dayIndex: [],
        dayIndexTruncated: false,
      },
    };
    const day = new Date('2026-06-15T00:00:00');
    const seeded = seedDayScopedAvailableCache(
      client,
      monthPage,
      { userId: 'u1', startDate: day, endDate: day, sport: 'PADEL', indexOnly: false },
      null,
      JUNE,
    );
    expect(seeded).toBe(true);
    const key = availableGamesQueryOptions({
      userId: 'u1',
      startDate: day,
      endDate: day,
      sport: 'PADEL',
    }).queryKey;
    const page = client.getQueryData(key) as AvailableGamesPage;
    expect(page.games).toEqual([]);
    expect(page.meta.hasMore).toBe(false);
  });
});
