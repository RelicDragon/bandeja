import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import type { Round } from '@/types/gameResults';
import {
  canFinishLeagueFixtureResults,
  canReopenLeagueFixtureResults,
  canStartLeagueFixtureResults,
  firstEditableSetIndex,
} from './leagueGameCardResults.util';

const owner = { id: 'owner', isAdmin: false };

function leagueGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'LEAGUE',
    gameType: 'CLASSIC',
    city: { id: 'c1', name: 'City' } as Game['city'],
    startTime: '',
    endTime: '',
    maxParticipants: 4,
    minParticipants: 4,
    isPublic: true,
    affectsRating: false,
    allowDirectJoin: false,
    status: 'SCHEDULED',
    resultsStatus: 'NONE',
    participantsReady: true,
    teamsReady: true,
    hasFixedTeams: true,
    participants: [{ userId: 'owner', role: 'OWNER', status: 'PLAYING' } as Game['participants'][number]],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

const readyRounds: Round[] = [
  { id: 'r1', matches: [{ id: 'm1', teamA: ['a'], teamB: ['b'], sets: [{ teamA: 0, teamB: 0 }] }] },
];

describe('league fixture results actions', () => {
  it('shows start only on non-finished fixtures the user can edit', () => {
    expect(canStartLeagueFixtureResults(leagueGame(), owner, false)).toBe(true);
    expect(canStartLeagueFixtureResults(leagueGame({ resultsStatus: 'IN_PROGRESS' }), owner, false)).toBe(
      false,
    );
    expect(canStartLeagueFixtureResults(leagueGame(), owner, true)).toBe(false);
    expect(canStartLeagueFixtureResults(leagueGame(), { id: 'stranger', isAdmin: false }, false)).toBe(
      false,
    );
    expect(
      canStartLeagueFixtureResults(
        leagueGame({
          resultsByAnyone: true,
          participants: [
            { userId: 'p1', role: 'PARTICIPANT', status: 'PLAYING' } as Game['participants'][number],
          ],
        }),
        { id: 'p1', isAdmin: false },
        false,
      ),
    ).toBe(true);
  });

  it('shows finish when results are in progress and teams are ready', () => {
    const inProgress = leagueGame({ resultsStatus: 'IN_PROGRESS' });
    expect(canFinishLeagueFixtureResults(inProgress, owner, readyRounds, false)).toBe(true);
    expect(canFinishLeagueFixtureResults(inProgress, owner, [{ id: 'r1', matches: [] }], false)).toBe(
      false,
    );
    expect(canFinishLeagueFixtureResults(leagueGame(), owner, readyRounds, false)).toBe(false);
  });

  it('shows edit on finished games unless walkover or technical withdrawal', () => {
    const finished = leagueGame({ resultsStatus: 'FINAL', status: 'FINISHED' });
    expect(canReopenLeagueFixtureResults(finished, owner, false)).toBe(true);
    expect(canReopenLeagueFixtureResults(finished, owner, true)).toBe(false);
    expect(
      canReopenLeagueFixtureResults(
        leagueGame({ resultsStatus: 'FINAL', metadata: { technicalWithdrawal: true } }),
        owner,
        false,
      ),
    ).toBe(false);
  });

  it('opens the first empty set for score entry', () => {
    expect(firstEditableSetIndex([{ teamA: 6, teamB: 4 }, { teamA: 0, teamB: 0 }])).toBe(1);
    expect(firstEditableSetIndex([{ teamA: 6, teamB: 4 }])).toBe(0);
    expect(firstEditableSetIndex([])).toBe(0);
  });
});
