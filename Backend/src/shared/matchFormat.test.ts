import assert from 'node:assert/strict';
import {
  maxFixedTeamSlots,
  maxPlayersPerTeamForGame,
  playersPerMatchOf,
  playersPerTeamOf,
} from './matchFormat';

type ParityCase = {
  label: string;
  game: {
    maxParticipants: number;
    playersPerMatch?: number;
    sport?: string;
  };
  playersPerMatch: 2 | 4;
  playersPerTeam: number;
  maxFixedTeamSlots: number;
  maxPlayersPerTeam: number;
};

const PARITY_CASES: ParityCase[] = [
  {
    label: 'singles 2-roster',
    game: { maxParticipants: 2, playersPerMatch: 2, sport: 'PADEL' },
    playersPerMatch: 2,
    playersPerTeam: 1,
    maxFixedTeamSlots: 2,
    maxPlayersPerTeam: 1,
  },
  {
    label: 'doubles 4-roster',
    game: { maxParticipants: 4, playersPerMatch: 4, sport: 'PADEL' },
    playersPerMatch: 4,
    playersPerTeam: 2,
    maxFixedTeamSlots: 2,
    maxPlayersPerTeam: 2,
  },
  {
    label: '8-player singles rotation',
    game: { maxParticipants: 8, playersPerMatch: 2, sport: 'TENNIS' },
    playersPerMatch: 2,
    playersPerTeam: 1,
    maxFixedTeamSlots: 8,
    maxPlayersPerTeam: 1,
  },
  {
    label: 'padel sport default doubles',
    game: { maxParticipants: 4, sport: 'PADEL' },
    playersPerMatch: 4,
    playersPerTeam: 2,
    maxFixedTeamSlots: 2,
    maxPlayersPerTeam: 2,
  },
];

function testParityTable(): void {
  for (const c of PARITY_CASES) {
    assert.equal(playersPerMatchOf(c.game), c.playersPerMatch, c.label);
    assert.equal(playersPerTeamOf(c.game), c.playersPerTeam, c.label);
    assert.equal(maxFixedTeamSlots(c.game), c.maxFixedTeamSlots, c.label);
    assert.equal(
      maxPlayersPerTeamForGame(c.game, c.game.maxParticipants),
      c.maxPlayersPerTeam,
      c.label,
    );
  }
}

function testParticipantCountFallback(): void {
  assert.equal(maxPlayersPerTeamForGame({ sport: 'PADEL' }, 2), 1);
  assert.equal(maxPlayersPerTeamForGame({ sport: 'PADEL' }, 4), 2);
}

function main(): void {
  testParityTable();
  testParticipantCountFallback();
  console.log('matchFormat.test: passed');
}

main();
