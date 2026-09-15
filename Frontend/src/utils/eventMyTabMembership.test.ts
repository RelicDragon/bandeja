import { describe, expect, it } from 'vitest';
import type { Game, GameParticipant, ParticipantRole } from '@/types';
import {
  excludeUnoptedEventsFromMyGames,
  isEventOptedInForMyTab,
} from './eventMyTabMembership';

function p(
  userId: string,
  status: GameParticipant['status'],
  lookingForPartner = false,
  role: ParticipantRole = 'PARTICIPANT',
): GameParticipant {
  return { id: `id-${userId}`, userId, status, role, lookingForPartner } as GameParticipant;
}

function g(
  id: string,
  entityType: Game['entityType'],
  participants: GameParticipant[],
): Game {
  return { id, entityType, participants } as Game;
}

describe('eventMyTabMembership', () => {
  it('keeps non-EVENT games', () => {
    const game = g('game', 'GAME', [p('u1', 'NON_PLAYING')]);
    expect(isEventOptedInForMyTab(game, 'u1')).toBe(true);
  });

  it('keeps EVENT for organizer, Going, or Looking', () => {
    expect(
      isEventOptedInForMyTab(g('org', 'EVENT', [p('u1', 'NON_PLAYING', false, 'OWNER')]), 'u1'),
    ).toBe(true);
    expect(isEventOptedInForMyTab(g('going', 'EVENT', [p('u1', 'PLAYING')]), 'u1')).toBe(true);
    expect(
      isEventOptedInForMyTab(g('looking', 'EVENT', [p('u1', 'NON_PLAYING', true)]), 'u1'),
    ).toBe(true);
    expect(
      isEventOptedInForMyTab(g('other', 'EVENT', [p('u1', 'NON_PLAYING')]), 'u1'),
    ).toBe(false);
  });

  it('drops EVENT listings the viewer does not organize or RSVP to', () => {
    const games = [
      g('listing', 'EVENT', [p('u1', 'NON_PLAYING')]),
      g('mine', 'EVENT', [p('u1', 'NON_PLAYING', false, 'OWNER')]),
      g('going', 'EVENT', [p('u1', 'PLAYING')]),
      g('match', 'GAME', [p('u1', 'PLAYING')]),
    ];
    expect(excludeUnoptedEventsFromMyGames(games, 'u1').map((game) => game.id)).toEqual([
      'mine',
      'going',
      'match',
    ]);
  });
});
