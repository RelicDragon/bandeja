import { Prisma } from '@prisma/client';
import { USER_SELECT_FIELDS } from '../../utils/constants';

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

    const leagueSeasonId = game.parentId;
    const leagueGroupId = game.leagueGroupId;

    const leagueSeason = await tx.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: {
        leagueId: true,
        game: {
          select: {
            hasFixedTeams: true,
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

    const leagueSeasonId = game.parentId;
    const leagueGroupId = game.leagueGroupId;

    const leagueSeason = await tx.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      select: {
        leagueId: true,
        game: {
          select: {
            hasFixedTeams: true,
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

      const existingParticipant = await tx.leagueParticipant.findFirst({
        where: {
          leagueSeasonId,
          userId: outcome.userId,
          participantType: 'USER',
        },
      });

      if (existingParticipant) {
        console.log(`[LEAGUE SYNC USER] Updating existing participant ${existingParticipant.id} for user ${outcome.userId}`);
        await tx.leagueParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            currentGroupId: leagueGroupId,
            points: { increment: points },
            wins: { increment: wins },
            ties: { increment: ties },
            losses: { increment: losses },
            scoreDelta: { increment: scoreDelta },
          },
        });
      } else {
        console.log(`[LEAGUE SYNC USER] Creating new participant for user ${outcome.userId}`);
        await tx.leagueParticipant.create({
          data: {
            leagueId,
            leagueSeasonId,
            participantType: 'USER',
            userId: outcome.userId,
            currentGroupId: leagueGroupId,
            points,
            wins,
            ties,
            losses,
            scoreDelta,
          },
        });
      }
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

      if (team) {
        console.log(`[LEAGUE SYNC TEAM] User ${outcome.userId} in team ${team.teamNumber}: wins=${wins}, ties=${ties}, losses=${losses}`);
        const existing = teamResults.get(team.teamNumber) || { wins: 0, ties: 0, losses: 0, scoresMade: 0, scoresLost: 0 };
        teamResults.set(team.teamNumber, {
          wins: existing.wins + wins,
          ties: existing.ties + ties,
          losses: existing.losses + losses,
          scoresMade: existing.scoresMade + scoresMade,
          scoresLost: existing.scoresLost + scoresLost,
        });
      }
    }

    console.log(`[LEAGUE SYNC TEAM] Aggregated results for ${teamResults.size} teams`);

    for (const [teamNumber, results] of teamResults) {
      console.log(`[LEAGUE SYNC TEAM] Team ${teamNumber}: wins=${results.wins}, ties=${results.ties}, losses=${results.losses}, scoresMade=${results.scoresMade}, scoresLost=${results.scoresLost}`);
      const team = game.fixedTeams.find((t: any) => t.teamNumber === teamNumber);
      if (!team) continue;

      const teamPlayerIds = team.players.map((p: any) => p.userId).sort();

      const leagueTeam = await tx.leagueTeam.findFirst({
        where: {
          players: {
            every: {
              userId: { in: teamPlayerIds },
            },
          },
        },
        include: {
          players: true,
        },
      });

      if (!leagueTeam) continue;

      if (leagueTeam.players.length !== teamPlayerIds.length) continue;

      const leagueTeamPlayerIds = leagueTeam.players.map((p: any) => p.userId).sort();
      if (!teamPlayerIds.every((id: string, idx: number) => id === leagueTeamPlayerIds[idx])) continue;

      const scoreDelta = results.scoresMade - results.scoresLost;
      const points = results.wins * pointsPerWin + results.ties * pointsPerTie + results.losses * pointsPerLoose;

      const existingParticipant = await tx.leagueParticipant.findFirst({
        where: {
          leagueSeasonId,
          leagueTeamId: leagueTeam.id,
          participantType: 'TEAM',
        },
      });

      if (existingParticipant) {
        console.log(`[LEAGUE SYNC TEAM] Updating existing participant ${existingParticipant.id} for team ${leagueTeam.id}`);
        await tx.leagueParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            currentGroupId: leagueGroupId,
            points: { increment: points },
            wins: { increment: results.wins },
            ties: { increment: results.ties },
            losses: { increment: results.losses },
            scoreDelta: { increment: scoreDelta },
          },
        });
      } else {
        console.log(`[LEAGUE SYNC TEAM] Creating new participant for team ${leagueTeam.id}`);
        await tx.leagueParticipant.create({
          data: {
            leagueId,
            leagueSeasonId,
            participantType: 'TEAM',
            leagueTeamId: leagueTeam.id,
            currentGroupId: leagueGroupId,
            points,
            wins: results.wins,
            ties: results.ties,
            losses: results.losses,
            scoreDelta,
          },
        });
      }
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

      if (team) {
        const existing = teamResults.get(team.teamNumber) || { wins: 0, ties: 0, losses: 0, scoresMade: 0, scoresLost: 0 };
        teamResults.set(team.teamNumber, {
          wins: existing.wins + wins,
          ties: existing.ties + ties,
          losses: existing.losses + losses,
          scoresMade: existing.scoresMade + scoresMade,
          scoresLost: existing.scoresLost + scoresLost,
        });
      }
    }

    for (const [teamNumber, results] of teamResults) {
      const team = game.fixedTeams.find((t: any) => t.teamNumber === teamNumber);
      if (!team) continue;

      const teamPlayerIds = team.players.map((p: any) => p.userId).sort();

      const leagueTeam = await tx.leagueTeam.findFirst({
        where: {
          players: {
            every: {
              userId: { in: teamPlayerIds },
            },
          },
        },
        include: {
          players: true,
        },
      });

      if (!leagueTeam) continue;

      if (leagueTeam.players.length !== teamPlayerIds.length) continue;

      const leagueTeamPlayerIds = leagueTeam.players.map((p: any) => p.userId).sort();
      if (!teamPlayerIds.every((id: string, idx: number) => id === leagueTeamPlayerIds[idx])) continue;

      const participant = await tx.leagueParticipant.findFirst({
        where: {
          leagueSeasonId,
          leagueTeamId: leagueTeam.id,
          participantType: 'TEAM',
        },
      });

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

