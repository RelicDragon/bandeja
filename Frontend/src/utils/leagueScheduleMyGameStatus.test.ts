import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import {
  gameMatchesLeagueScheduleMyStatus,
  leagueScheduleMyGameStatus,
} from './leagueScheduleMyGameStatus';

function game(partial: Partial<Game>): Game {
  return {
    id: 'g1',
    startTime: '2026-01-01T10:00:00.000Z',
    resultsStatus: 'NONE',
    timeIsSet: false,
    ...partial,
  } as Game;
}

describe('leagueScheduleMyGameStatus', () => {
  it('classifies not scheduled, scheduled, played', () => {
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: false }))).toBe('NOT_SCHEDULED');
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: undefined }))).toBe('NOT_SCHEDULED');
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: true }))).toBe('SCHEDULED');
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: true, resultsStatus: 'IN_PROGRESS' }))).toBe(
      'SCHEDULED',
    );
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: false, resultsStatus: 'IN_PROGRESS' }))).toBe(
      'SCHEDULED',
    );
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: false, resultsStatus: 'FINAL' }))).toBe(
      'PLAYED',
    );
    expect(leagueScheduleMyGameStatus(game({ timeIsSet: true, resultsStatus: 'FINAL' }))).toBe(
      'PLAYED',
    );
  });

  it('matches filter', () => {
    const unscheduled = game({ timeIsSet: false });
    expect(gameMatchesLeagueScheduleMyStatus(unscheduled, 'ALL')).toBe(true);
    expect(gameMatchesLeagueScheduleMyStatus(unscheduled, 'NOT_SCHEDULED')).toBe(true);
    expect(gameMatchesLeagueScheduleMyStatus(unscheduled, 'SCHEDULED')).toBe(false);
    expect(gameMatchesLeagueScheduleMyStatus(unscheduled, 'PLAYED')).toBe(false);

    const finalUnset = game({ timeIsSet: false, resultsStatus: 'FINAL' });
    expect(gameMatchesLeagueScheduleMyStatus(finalUnset, 'NOT_SCHEDULED')).toBe(false);
    expect(gameMatchesLeagueScheduleMyStatus(finalUnset, 'PLAYED')).toBe(true);
  });
});
