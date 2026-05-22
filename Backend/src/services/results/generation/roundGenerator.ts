import { randomUUID } from 'crypto';
import type { GenGame, GenMatch, GenRound } from './types';
import { attachFixedTeamIdsToMatch, cloneSets, playersPerMatchOf } from './matchUtils';
import { getRules, isClassicRules } from '../liveScoringEngine/rulebook';
import { generateFixedRound } from './fixed';
import { generateRandomRound } from './random';
import { generateRatingRound } from './rating';
import { generateEscaleraRound } from './escalera';
import { generateWinnersCourtRound } from './winnersCourt';

export interface RoundGeneratorOptions {
  rounds: GenRound[];
  game: GenGame;
  roundNumber: number;
  fixedNumberOfSets?: number;
}

function createOneOnOneMatches(players: { id: string }[]): { teamA: string[]; teamB: string[] }[] {
  if (players.length !== 2) {
    throw new Error('One-on-one games require exactly 2 players');
  }
  return [{ teamA: [players[0].id], teamB: [players[1].id] }];
}

function createTwoOnTwoMatches(players: { id: string }[]): { teamA: string[]; teamB: string[] }[] {
  if (players.length !== 4) {
    throw new Error('Two-on-two games require exactly 4 players');
  }
  return [
    { teamA: [players[0].id, players[1].id], teamB: [players[2].id, players[3].id] },
    { teamA: [players[0].id, players[2].id], teamB: [players[1].id, players[3].id] },
    { teamA: [players[0].id, players[3].id], teamB: [players[1].id, players[2].id] },
  ];
}

function emptySetRow(): { teamA: number; teamB: number; isTieBreak: boolean } {
  return { teamA: 0, teamB: 0, isTieBreak: false };
}

/** Align empty set rows with frontend `initialSetsForRules` / scoring preset (not raw fixedNumberOfSets alone). */
function initialSetRowsForMatch(
  game: RoundGeneratorOptions['game'],
  fixedNumberOfSets: number
): Array<{ teamA: number; teamB: number; isTieBreak: boolean }> {
  const rules = getRules({
    scoringPreset: game.scoringPreset ?? null,
    fixedNumberOfSets: fixedNumberOfSets > 0 ? fixedNumberOfSets : (game.fixedNumberOfSets ?? 0),
    maxTotalPointsPerSet: game.maxTotalPointsPerSet ?? 0,
    maxPointsPerTeam: game.maxPointsPerTeam ?? 0,
    winnerOfMatch: game.winnerOfMatch ?? null,
    ballsInGames: game.ballsInGames ?? false,
    hasGoldenPoint: game.hasGoldenPoint ?? false,
    pointsPerTie: game.pointsPerTie ?? 0,
    matchTimerEnabled: game.matchTimerEnabled ?? false,
  });

  if (isClassicRules(rules)) {
    if (rules.fixedNumberOfSets === 1) return [emptySetRow()];
    const shown = Math.max(1, rules.minSetsToWin);
    return Array.from({ length: shown }, () => emptySetRow());
  }

  const n = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : 1;
  return Array.from({ length: n }, () => emptySetRow());
}

export class RoundGenerator {
  private options: RoundGeneratorOptions;

  constructor(options: RoundGeneratorOptions) {
    this.options = options;
  }

  async generateRound(): Promise<GenMatch[]> {
    const { matchGenerationType } = this.options.game;
    const fixedNumberOfSets = this.options.fixedNumberOfSets || 0;
    const initialSets = initialSetRowsForMatch(this.options.game, fixedNumberOfSets);

    if (!matchGenerationType || matchGenerationType === 'HANDMADE') {
      return [
        {
          id: randomUUID(),
          teamA: [],
          teamB: [],
          sets: cloneSets(initialSets),
        },
      ];
    }

    if (matchGenerationType === 'AUTOMATIC') {
      return this.generateAutomaticRound(initialSets);
    }

    switch (matchGenerationType) {
      case 'FIXED':
        return generateFixedRound(this.options.game, this.options.rounds, initialSets);
      case 'RANDOM':
        return generateRandomRound(this.options.game, this.options.rounds, initialSets);
      case 'RATING':
        return generateRatingRound(this.options.game, this.options.rounds, initialSets);
      case 'WINNERS_COURT':
        return generateWinnersCourtRound(this.options.game, this.options.rounds, initialSets);
      case 'ESCALERA':
        return generateEscaleraRound(this.options.game, this.options.rounds, initialSets);
      case 'ROUND_ROBIN':
        throw new Error('ROUND_ROBIN is not supported');
      default:
        throw new Error(`Unsupported match generation type: ${String(matchGenerationType)}`);
    }
  }

  private generateAutomaticRound(
    initialSets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean }>
  ): GenMatch[] {
    const { game } = this.options;
    const playingParticipants = game.participants.filter((p) => p.status === 'PLAYING');
    const numPlayers = playingParticipants.length;
    const ppm = playersPerMatchOf(game);
    const players = playingParticipants.map((p) => p.user);
    const matches: GenMatch[] = [];

    if (numPlayers === ppm) {
      if (game.hasFixedTeams && game.fixedTeams && game.fixedTeams.length >= 2) {
        const team1 = game.fixedTeams.find((t) => t.teamNumber === 1);
        const team2 = game.fixedTeams.find((t) => t.teamNumber === 2);

        if (team1 && team2 && team1.players.length > 0 && team2.players.length > 0) {
          const teamAIds = team1.players.map((p) => p.userId);
          const teamBIds = team2.players.map((p) => p.userId);
          if (game.allowUserInMultipleTeams) {
            const sideA = new Set(teamAIds);
            if (teamBIds.some((id) => sideA.has(id))) {
              throw new Error(
                'Automatic first round cannot pair fixed teams that share a player when overlap across teams is allowed'
              );
            }
          }
          matches.push(
            attachFixedTeamIdsToMatch(
              {
                id: randomUUID(),
                teamA: teamAIds,
                teamB: teamBIds,
                sets: cloneSets(initialSets),
              },
              game
            )
          );
        }
      } else {
        const matchSetups = createTwoOnTwoMatches(players);
        for (const setup of matchSetups) {
          matches.push({
            id: randomUUID(),
            teamA: setup.teamA,
            teamB: setup.teamB,
            sets: cloneSets(initialSets),
          });
        }
      }
    } else if (numPlayers === 2 && ppm === 2) {
      const matchSetups = createOneOnOneMatches(players);
      if (matchSetups.length > 0) {
        matches.push({
          id: randomUUID(),
          teamA: matchSetups[0].teamA,
          teamB: matchSetups[0].teamB,
          sets: cloneSets(initialSets),
        });
      }
    } else {
      matches.push({
        id: randomUUID(),
        teamA: [],
        teamB: [],
        sets: cloneSets(initialSets),
      });
    }

    return matches;
  }
}
