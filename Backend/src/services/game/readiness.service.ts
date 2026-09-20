import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { playersPerTeamOf } from '../results/generation/matchUtils';

export type GameReadinessDb = typeof prisma | Prisma.TransactionClient;

export class GameReadinessService {
  static async calculateGameReadiness(gameId: string, db: GameReadinessDb = prisma) {
    const game = await db.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { status: 'PLAYING' },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
          },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const playingParticipantsCount = game.participants.length;
    const maxParticipants = game.maxParticipants;
    const perTeam = playersPerTeamOf(game);

    let teamsReady = false;
    if (game.hasFixedTeams && game.fixedTeams.length > 0) {
      const pairSlotsLayout =
        maxParticipants > 0 && game.fixedTeams.length * perTeam === maxParticipants;
      const allTeamsHavePlayers = pairSlotsLayout
        ? game.fixedTeams.every(team => team.players.length === perTeam)
        : game.fixedTeams.every(team => team.players.length > 0);

      const allPlayersArePlayingParticipants = game.fixedTeams.every(team =>
        team.players.every(player => {
          return game.participants.some(p => p.userId === player.userId);
        })
      );

      teamsReady = allTeamsHavePlayers && allPlayersArePlayingParticipants;
      
      console.log('Calculated teamsReady:', {
        gameId: game.id,
        hasFixedTeams: game.hasFixedTeams,
        fixedTeamsCount: game.fixedTeams.length,
        allTeamsHavePlayers,
        allPlayersArePlayingParticipants,
        teamsReady,
        participants: game.participants.map(p => ({ userId: p.userId, status: p.status })),
        fixedTeams: game.fixedTeams.map(team => ({
          teamNumber: team.teamNumber,
          players: team.players.map(p => ({ userId: p.userId }))
        }))
      });
    }

    const overlapFixedPairLayout =
      !!game.hasFixedTeams &&
      !!game.allowUserInMultipleTeams &&
      game.fixedTeams.length > 0 &&
      maxParticipants > 0 &&
      game.fixedTeams.length * perTeam === maxParticipants;

    const participantsReady =
      playingParticipantsCount === maxParticipants ||
      (overlapFixedPairLayout && teamsReady);

    return {
      participantsReady,
      teamsReady,
    };
  }

  static async updateGameReadiness(gameId: string, db: GameReadinessDb = prisma) {
    const readiness = await this.calculateGameReadiness(gameId, db);

    const updated = await db.game.update({
      where: { id: gameId },
      data: {
        participantsReady: readiness.participantsReady,
        teamsReady: readiness.teamsReady,
      },
    });

    // PRD 348 — this is the one call every roster mutation already makes, so it
    // is where the cost split re-materializes. Fire-and-forget: the ledger is
    // derived state and must never be able to fail a join or a leave. Skipped
    // inside a transaction, where a second client would deadlock on the row.
    if (db === prisma) {
      void import('../gameCost/gameCost.service')
        .then(({ syncGameCostShares }) => syncGameCostShares(gameId))
        .catch((error) =>
          console.error('Failed to resync cost shares after roster change:', error),
        );
    }

    return updated;
  }
}

