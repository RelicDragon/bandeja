import { describe, expect, it } from 'vitest';
import { gameCardPropsEqual } from './gameCardPropsEqual';
import type { Game } from '@/types';

function baseGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    sport: 'PADEL',
    gameType: 'CLASSIC',
    city: { id: 'c1', name: 'City', country: 'X' } as Game['city'],
    startTime: '2026-05-21T17:00:00.000Z',
    endTime: '2026-05-21T19:00:00.000Z',
    maxParticipants: 4,
    minParticipants: 2,
    isPublic: true,
    affectsRating: true,
    allowDirectJoin: true,
    status: 'SCHEDULED',
    resultsStatus: 'NONE',
    participants: [],
    ...overrides,
  } as Game;
}

const stableHandlers = {
  onJoin: () => {},
  onNoteSaved: () => {},
};

describe('gameCardPropsEqual', () => {
  it('treats same visual data as equal despite new object refs', () => {
    const a = {
      game: baseGame({ name: 'Test' }),
      user: { id: 'u1', alwaysShowUserNames: true },
      unreadCount: 0,
      ...stableHandlers,
    };
    const b = {
      game: baseGame({ name: 'Test' }),
      user: { id: 'u1', alwaysShowUserNames: true },
      unreadCount: 0,
      ...stableHandlers,
    };
    expect(gameCardPropsEqual(a, b)).toBe(true);
  });

  it('detects participant status changes for the viewer', () => {
    const participants = [
      {
        userId: 'u1',
        role: 'PLAYER',
        status: 'INVITED',
        user: { id: 'u1', firstName: 'A', lastName: 'B' },
      },
    ] as Game['participants'];
    const a = {
      game: baseGame({ participants }),
      user: { id: 'u1' },
      unreadCount: 0,
      ...stableHandlers,
    };
    const b = {
      game: baseGame({
        participants: [{ ...participants[0], status: 'PLAYING' } as (typeof participants)[0]],
      }),
      user: { id: 'u1' },
      unreadCount: 0,
      ...stableHandlers,
    };
    expect(gameCardPropsEqual(a, b)).toBe(false);
  });

  it('detects owner premium changes for fire icon', () => {
    const participants = [
      {
        userId: 'owner',
        role: 'OWNER',
        status: 'NON_PLAYING',
        user: { id: 'owner', isPremium: false },
      },
    ] as Game['participants'];
    const a = {
      game: baseGame({ status: 'ANNOUNCED', participants }),
      user: { id: 'u2' },
      unreadCount: 0,
      ...stableHandlers,
    };
    const b = {
      game: baseGame({
        status: 'ANNOUNCED',
        participants: [
          {
            ...participants[0],
            user: { ...participants[0].user!, isPremium: true },
          } as (typeof participants)[0],
        ],
      }),
      user: { id: 'u2' },
      unreadCount: 0,
      ...stableHandlers,
    };
    expect(gameCardPropsEqual(a, b)).toBe(false);
  });

  it('detects unread count changes', () => {
    const props = {
      game: baseGame(),
      user: { id: 'u1' },
      ...stableHandlers,
    };
    expect(gameCardPropsEqual({ ...props, unreadCount: 0 }, { ...props, unreadCount: 2 })).toBe(
      false
    );
  });

  it('detects main photo thumbnail changes', () => {
    const props = {
      game: baseGame(),
      user: { id: 'u1' },
      unreadCount: 0,
      ...stableHandlers,
    };
    const withPhoto = {
      ...props,
      game: baseGame({
        photosCount: 1,
        mainPhoto: { id: 'p1', thumbnailUrl: 'a.jpg', originalUrl: 'a.jpg' },
      }),
    };
    const withOtherPhoto = {
      ...props,
      game: baseGame({
        photosCount: 1,
        mainPhoto: { id: 'p1', thumbnailUrl: 'b.jpg', originalUrl: 'b.jpg' },
      }),
    };
    expect(gameCardPropsEqual(withPhoto, withOtherPhoto)).toBe(false);
  });
});
