import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  mergeAvailableGamesPages,
  parseAvailableGamesMeta,
  structuralToApiParams,
} from './availableGamesPage';

describe('availableGamesPage', () => {
  it('parses meta including dayIndex and ceiling fields', () => {
    const meta = parseAvailableGamesMeta({
      take: 100,
      bound: 300,
      hasMore: true,
      nextCursor: 'abc',
      truncated: true,
      dayIndexTruncated: true,
      dayIndex: [
        {
          id: 'g1',
          startTime: '2026-06-01T10:00:00.000Z',
          entityType: 'GAME',
          minLevel: 2,
          maxLevel: 4,
          maxParticipants: 4,
          genderTeams: 'ANY',
          trainerId: null,
          clubId: null,
          isPublic: true,
          timeIsSet: true,
          ownerUserId: null,
        },
      ],
    });
    expect(meta.take).toBe(100);
    expect(meta.bound).toBe(300);
    expect(meta.hasMore).toBe(true);
    expect(meta.nextCursor).toBe('abc');
    expect(meta.dayIndex).toHaveLength(1);
    expect(meta.dayIndexTruncated).toBe(true);
  });

  it('merges pages without duplicates or wiping prior rows', () => {
    const a = [{ id: 'g1' }, { id: 'g2' }] as Game[];
    const b = [{ id: 'g2' }, { id: 'g3' }] as Game[];
    expect(mergeAvailableGamesPages(a, b).map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('maps structural params for API', () => {
    expect(
      structuralToApiParams({
        mode: 'calendar',
        clubIds: 'c1,c2',
        hideBar: true,
        availableSlots: true,
        levelMin: 2,
        levelMax: 5,
        entityTypes: 'GAME',
      }),
    ).toEqual({
      mode: 'calendar',
      clubIds: 'c1,c2',
      hideBar: true,
      availableSlots: true,
      levelMin: 2,
      levelMax: 5,
      entityTypes: 'GAME',
    });
  });
});
