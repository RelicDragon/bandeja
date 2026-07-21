import { Prisma } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { playersPerTeamOf } from '../results/generation/matchUtils';
import {
  ensureTeamLeagueParticipant,
  ensureUserLeagueParticipant,
  findTeamParticipantByRoster,
  findUserParticipant,
} from './leagueParticipantResolve';

type ScoringRules = {
  pointsPerWin: number;
  pointsPerTie: number;
  pointsPerLoose: number;
};

export class LeagueGameResultsService {
  static async syncGameResults(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        outcomes: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
        fixedTeams: {
          include: {
            players: true,
          },
        },
        leagueRound: {
          select: { roundType: true },
        },
      },
    });

    if (!game) {
      console.log(`[LEAGUE SYNC] Game ${gameId} not found`);
      return;
    }

    console.log(`[LEAGUE SYNC] Game ${gameId}: entityType=${game.entityType}, parentId=${game.parentId}, leagueRoundId=${game.leagueRoundId}, leagueGroupId=${game.leagueGroupId}`);

    if (
      game.entityType !== 'LEAGUE' ||
      !game.parentId ||
      !game.leagueRoundId ||
      !game.leagueGroupId
    ) {
      console.log(`[LEAGUE SYNC] Game ${gameId} does not meet league criteria, skipping sync`);
      return;
    }

    if (game.leagueRound?.roundType === 'PLAYOFF') {
      console.log(`[LEAGUE SYNC] Game ${gameId} is a playoff game, standings are season-only, skipping sync`);
      return;
    }

    const leagueSeasonId = game.parentId;
    const leagueGroupId = game.leagueGroupId;

    const leagueSeason = await tx.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: {
        leagueId: true,
        game: {
          select: {
            hasFixedTeams: true,
            playersPerMatch: true,
            pointsPerWin: true,
            pointsPerLoose: true,
            pointsPerTie: true,
          },
        },
      },
    });

    if (!leagueSeason) {
      return;
    }

    const leagueId = leagueSeason.leagueId;
    const hasFixedTeams = leagueSeason.game?.hasFixedTeams || false;
    const expectedPlayersPerTeam = playersPerTeamOf(leagueSeason.game ?? {});
    const scoringRules = {
      pointsPerWin: leagueSeason.game?.pointsPerWin ?? 0,
      pointsPerTie: leagueSeason.game?.pointsPerTie ?? 0,
      pointsPerLoose: leagueSeason.game?.pointsPerLoose ?? 0,
    };

    if (hasFixedTeams) {
      await this.syncTeamResults(
        gameId,
        leagueId,
        leagueSeasonId,
        leagueGroupId,
        game,
        scoringRules,
        expectedPlayersPerTeam,
        tx
      );
    } else {
      await this.syncUserResults(
        gameId,
        leagueId,
        leagueSeasonId,
        leagueGroupId,
        game,
        scoringRules,
        tx
      );
    }
  }

  static async unsyncGameResults(
    gameId: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        outcomes: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
        fixedTeams: {
          include: {
            players: true,
          },
        },
        leagueRound: {
          select: { roundType: true },
        },
      },
    });

    if (!game) {
      return;
    }

    if (
      game.entityType !== 'LEAGUE' ||
      !game.parentId ||
      !game.leagueRoundId ||
      !game.leagueGroupId
    ) {
      return;
    }

    if (game.leagueRound?.roundType === 'PLAYOFF') {
      return;
    }

    const leagueSeasonId = game.parentId;
    const leagueGroupId = game.leagueGroupId;

    const leagueSeason = await tx.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: {
        leagueId: true,
        game: {
          select: {
            hasFixedTeams: true,
            playersPerMatch: true,
            pointsPerWin: true,
            pointsPerLoose: true,
            pointsPerTie: true,
          },
        },
      },
    });

    if (!leagueSeason) {
      return;
    }

    const leagueId = leagueSeason.leagueId;
    const hasFixedTeams = leagueSeason.game?.hasFixedTeams || false;
    const expectedPlayersPerTeam = playersPerTeamOf(leagueSeason.game ?? {});
    const scoringRules = {
      pointsPerWin: leagueSeason.game?.pointsPerWin ?? 0,
      pointsPerTie: leagueSeason.game?.pointsPerTie ?? 0,
      pointsPerLoose: leagueSeason.game?.pointsPerLoose ?? 0,
    };

    if (hasFixedTeams) {
      await this.unsyncTeamResults(
        gameId,
        leagueId,
        leagueSeasonId,
        leagueGroupId,
        game,
        scoringRules,
        expectedPlayersPerTeam,
        tx
      );
    } else {
      await this.unsyncUserResults(
        gameId,
        leagueId,
        leagueSeasonId,
        leagueGroupId,
        game,
        scoringRules,
        tx
      );
    }
  }

  private static async syncUserResults(
    gameId: string,
    leagueId: string,
    leagueSeasonId: string,
    leagueGroupId: string,
    game: any,
    scoringRules: ScoringRules,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const { pointsPerWin, pointsPerTie, pointsPerLoose } = scoringRules;

    console.log(`[LEAGUE SYNC USER] Processing ${game.outcomes.length} outcomes for game ${gameId}`);

    for (const outcome of game.outcomes) {
      const wins = outcome.wins || 0;
      const ties = outcome.ties || 0;
      const losses = outcome.losses || 0;
      const scoresMade = outcome.scoresMade || 0;
      const scoresLost = outcome.scoresLost || 0;
      const scoreDelta = scoresMade - scoresLost;
      const points = wins * pointsPerWin + ties * pointsPerTie + losses * pointsPerLoose;

      console.log(`[LEAGUE SYNC USER] User ${outcome.userId}: wins=${wins}, ties=${ties}, losses=${losses}, scoresMade=${scoresMade}, scoresLost=${scoresLost}, points=${points}`);

      const existingUser = await findUserParticipant(tx, leagueSeasonId, outcome.userId);
      const { participantId, created } = await ensureUserLeagueParticipant(tx, {
        leagueId,
        leagueSeasonId,
        userId: outcome.userId,
        leagueGroupId,
        stats: { points, wins, ties, losses, scoreDelta },
        useIncrement: Boolean(existingUser),
      });
      console.log(
        `[LEAGUE SYNC USER] ${created ? 'Created' : 'Updated'} participant ${participantId} for user ${outcome.userId}`
      );
    }
    
    console.log(`[LEAGUE SYNC USER] Completed syncing ${game.outcomes.length} outcomes`);
  }

  private static async unsyncUserResults(
    gameId: string,
    leagueId: string,
    leagueSeasonId: string,
    leagueGroupId: string,
    game: any,
    scoringRules: ScoringRules,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const { pointsPerWin, pointsPerTie, pointsPerLoose } = scoringRules;

    console.log(`[LEAGUE UNSYNC USER] Processing ${game.outcomes.length} outcomes for game ${gameId}`);

    for (const outcome of game.outcomes) {
      const wins = outcome.wins || 0;
      const ties = outcome.ties || 0;
      const losses = outcome.losses || 0;
      const scoresMade = outcome.scoresMade || 0;
      const scoresLost = outcome.scoresLost || 0;
      const scoreDelta = scoresMade - scoresLost;
      const points = wins * pointsPerWin + ties * pointsPerTie + losses * pointsPerLoose;

      const participant = await tx.leagueParticipant.findFirst({
        where: {
          leagueSeasonId,
          userId: outcome.userId,
          participantType: 'USER',
        },
      });

      if (participant) {
        await tx.leagueParticipant.update({
          where: { id: participant.id },
          data: {
            points: { decrement: points },
            wins: { decrement: wins },
            ties: { decrement: ties },
            losses: { decrement: losses },
            scoreDelta: { decrement: scoreDelta },
          },
        });
      }
    }
  }

  private static async syncTeamResults(
    gameId: string,
    leagueId: string,
    leagueSeasonId: string,
    leagueGroupId: string,
    game: any,
    scoringRules: ScoringRules,
    expectedPlayersPerTeam: number,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const { pointsPerWin, pointsPerTie, pointsPerLoose } = scoringRules;

    console.log(`[LEAGUE SYNC TEAM] Processing ${game.outcomes.length} outcomes for game ${gameId}`);

    const teamResults = new Map<number, { wins: number; ties: number; losses: number; scoresMade: number; scoresLost: number }>();

    for (const outcome of game.outcomes) {
      const wins = outcome.wins || 0;
      const ties = outcome.ties || 0;
      const losses = outcome.losses || 0;
      const scoresMade = outcome.scoresMade || 0;
      const scoresLost = outcome.scoresLost || 0;

      const team = game.fixedTeams.find((t: any) =>
        t.players.some((p: any) => p.userId === outcome.userId)
      );

      if (team && !teamResults.has(team.teamNumber)) {
        console.log(`[LEAGUE SYNC TEAM] User ${outcome.userId} in team ${team.teamNumber}: wins=${wins}, ties=${ties}, losses=${losses}`);
        teamResults.set(team.teamNumber, {
          wins,
          ties,
          losses,
          scoresMade,
          scoresLost,
        });
      }
    }

    console.log(`[LEAGUE SYNC TEAM] Aggregated results for ${teamResults.size} teams`);

    for (const [teamNumber, results] of teamResults) {
      console.log(`[LEAGUE SYNC TEAM] Team ${teamNumber}: wins=${results.wins}, ties=${results.ties}, losses=${results.losses}, scoresMade=${results.scoresMade}, scoresLost=${results.scoresLost}`);
      const team = game.fixedTeams.find((t: any) => t.teamNumber === teamNumber);
      if (!team) continue;

      const teamPlayerIds = team.players.map((p: any) => p.userId);
      if (teamPlayerIds.length !== expectedPlayersPerTeam) continue;

      const scoreDelta = results.scoresMade - results.scoresLost;
      const points = results.wins * pointsPerWin + results.ties * pointsPerTie + results.losses * pointsPerLoose;

      const existingTeam = await findTeamParticipantByRoster(tx, leagueSeasonId, teamPlayerIds);
      const { participantId, created } = await ensureTeamLeagueParticipant(tx, {
        leagueId,
        leagueSeasonId,
        teamPlayerIds,
        leagueGroupId,
        stats: {
          points,
          wins: results.wins,
          ties: results.ties,
          losses: results.losses,
          scoreDelta,
        },
        useIncrement: Boolean(existingTeam),
      });
      console.log(
        `[LEAGUE SYNC TEAM] ${created ? 'Created' : 'Updated'} participant ${participantId} for roster ${teamPlayerIds.join(',')}`
      );
    }
    
    console.log(`[LEAGUE SYNC TEAM] Completed syncing team results`);
  }

  private static async unsyncTeamResults(
    gameId: string,
    leagueId: string,
    leagueSeasonId: string,
    leagueGroupId: string,
    game: any,
    scoringRules: ScoringRules,
    expectedPlayersPerTeam: number,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const { pointsPerWin, pointsPerTie, pointsPerLoose } = scoringRules;

    console.log(`[LEAGUE UNSYNC TEAM] Processing ${game.outcomes.length} outcomes for game ${gameId}`);

    const teamResults = new Map<number, { wins: number; ties: number; losses: number; scoresMade: number; scoresLost: number }>();

    for (const outcome of game.outcomes) {
      const wins = outcome.wins || 0;
      const ties = outcome.ties || 0;
      const losses = outcome.losses || 0;
      const scoresMade = outcome.scoresMade || 0;
      const scoresLost = outcome.scoresLost || 0;

      const team = game.fixedTeams.find((t: any) =>
        t.players.some((p: any) => p.userId === outcome.userId)
      );

      if (team && !teamResults.has(team.teamNumber)) {
        teamResults.set(team.teamNumber, {
          wins,
          ties,
          losses,
          scoresMade,
          scoresLost,
        });
      }
    }

    for (const [teamNumber, results] of teamResults) {
      const team = game.fixedTeams.find((t: any) => t.teamNumber === teamNumber);
      if (!team) continue;

      const teamPlayerIds = team.players.map((p: any) => p.userId);
      if (teamPlayerIds.length !== expectedPlayersPerTeam) continue;

      const participant = await findTeamParticipantByRoster(tx, leagueSeasonId, teamPlayerIds);

      if (participant) {
        const scoreDelta = results.scoresMade - results.scoresLost;
        const points = results.wins * pointsPerWin + results.ties * pointsPerTie + results.losses * pointsPerLoose;

        await tx.leagueParticipant.update({
          where: { id: participant.id },
          data: {
            points: { decrement: points },
            wins: { decrement: results.wins },
            ties: { decrement: results.ties },
            losses: { decrement: results.losses },
            scoreDelta: { decrement: scoreDelta },
          },
        });
      }
    }
  }
}

