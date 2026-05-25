import { describe, expect, it } from 'vitest';
import { resolveNotificationTapRoute } from './pushNotificationBracketRouting.util';

describe('pushNotificationBracketRouting.util (UX-C3)', () => {
  it('routes INVITE with bracket extras to schedule bracket tab', () => {
    expect(
      resolveNotificationTapRoute('INVITE', {
        gameId: 'game-1',
        leagueSeasonId: 'season-1',
        scheduleSubtab: 'bracket',
        scheduleGroup: 'g1',
        scheduleRoundId: 'round-1',
      })
    ).toEqual({
      kind: 'schedule-bracket',
      nav: { leagueSeasonId: 'season-1', roundId: 'round-1', group: 'g1' },
    });
  });

  it('routes GAME_REMINDER bracket extras to schedule bracket tab', () => {
    expect(
      resolveNotificationTapRoute('GAME_REMINDER', {
        gameId: 'game-1',
        leagueSeasonId: 'season-1',
        scheduleSubtab: 'bracket',
      })
    ).toEqual({
      kind: 'schedule-bracket',
      nav: { leagueSeasonId: 'season-1', roundId: undefined, group: undefined },
    });
  });

  it('falls back to game route when no bracket extras', () => {
    expect(resolveNotificationTapRoute('INVITE', { gameId: 'game-9' })).toEqual({
      kind: 'game',
      gameId: 'game-9',
    });
  });
});
