import { EntityType, Prisma, ResultsStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { isGameArchived } from '@bandeja/shared/gameMutationLock';
import { addOrUpdateParticipant } from '../../utils/participantOperations';
import { validateGenderForGame, type GameWithParticipants } from '../../utils/participantValidation';
import { ensureUserSportProfileForGame } from '../user/userSportProfile.service';
import { InviteService } from '../invite.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { GameService } from './game.service';
import { BetService } from '../bets/bet.service';
import { SystemMessageType } from '../../utils/systemMessages';

export interface SubstituteGameParticipantParams {
  gameId: string;
  outUserId: string;
  inUserId: string;
  actorUserId: string;
}

/**
 * Swaps `inUserId` into the seat held by `outUserId` while results entry is in progress.
 *
 * The substitute *inherits* the seat: every `TeamPlayer` row for the game is rewritten,
 * including matches already scored, so the results read as if the substitute had played
 * throughout. The outgoing player keeps no rating or standing for the game. See
 * `docs/product/constraints.md`.
 *
 * The seat count never changes, so `maxParticipants` stays frozen and the roster can
 * never grow past it through this path.
 */
export class GameParticipantSubstitutionService {
  static async substitute({
    gameId,
    outUserId,
    inUserId,
    actorUserId,
  }: SubstituteGameParticipantParams) {
    if (outUserId === inUserId) {
      throw new ApiError(400, 'errors.games.substituteSamePlayer');
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        status: true,
        resultsStatus: true,
        entityType: true,
        genderTeams: true,
        maxParticipants: true,
        trainerId: true,
        participants: {
          select: {
            id: true,
            userId: true,
            status: true,
            role: true,
            user: { select: { gender: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { outcomes: true } },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    if (isGameArchived(game)) {
      throw new ApiError(400, 'errors.games.cannotEditArchived');
    }
    // League rosters resolve standings by roster key and carry roster aliases, so a rewrite
    // here would drop the fixture out of the standings. `LeagueTeamPlayerSwapService` owns
    // that flow.
    if (game.entityType === EntityType.LEAGUE || game.entityType === EntityType.LEAGUE_SEASON) {
      throw new ApiError(400, 'errors.games.substituteNotSupportedForLeague');
    }
    if (game.resultsStatus !== ResultsStatus.IN_PROGRESS) {
      throw new ApiError(
        400,
        game.resultsStatus === ResultsStatus.FINAL
          ? 'errors.games.substituteResultsFinal'
          : 'errors.games.substituteResultsNotStarted',
      );
    }
    if (game.trainerId === outUserId) {
      throw new ApiError(400, 'errors.games.substituteCannotReplaceTrainer');
    }

    const outParticipant = game.participants.find((p) => p.userId === outUserId);
    if (!outParticipant || outParticipant.status !== 'PLAYING') {
      throw new ApiError(400, 'errors.games.substituteOutNotPlaying');
    }

    const inParticipant = game.participants.find((p) => p.userId === inUserId);
    if (inParticipant?.status === 'PLAYING') {
      throw new ApiError(400, 'errors.games.substituteInAlreadyPlaying');
    }

    await assertSubstituteGenderEligible(game, outUserId, inUserId);

    await prisma.$transaction(async (tx) => {
      await rewriteMatchRosters(tx, gameId, outUserId, inUserId);
      await rewriteFixedTeamSlots(tx, gameId, outUserId, inUserId);
      await addOrUpdateParticipant(tx, gameId, inUserId, { status: 'PLAYING' });
      await tx.gameParticipant.update({
        where: { id: outParticipant.id },
        data: { status: 'NON_PLAYING', activeMatchId: null },
      });
    });

    if (game._count.outcomes > 0) {
      const { recalculateGameOutcomes } = await import('../results/outcomes.service');
      await recalculateGameOutcomes(gameId, { preserveBracketStructure: true });
    }

    await ensureUserSportProfileForGame(inUserId, gameId);
    await InviteService.deleteInvitesForUserInGame(gameId, inUserId);
    await BetService.cancelBetsWithUserInCondition(gameId, outUserId).catch((error) =>
      console.error('Failed to cancel bets for substituted player:', error),
    );

    if (outParticipant.user) {
      await ParticipantMessageHelper.sendLeaveMessage(
        gameId,
        outParticipant.user,
        SystemMessageType.USER_LEFT_GAME,
      );
    }
    // No `excludeUserId`: unlike a self-initiated join, the substitute was added by someone
    // else and is the person who most needs to hear about it.
    await ParticipantMessageHelper.sendJoinMessage(gameId, inUserId, SystemMessageType.USER_JOINED_GAME);

    await GameService.updateGameReadiness(gameId);

    // Match rosters changed, so results viewers must reload — `emitGameUpdate` alone only
    // refreshes the game, not the rounds held by the results engine.
    const socketService = (global as any).socketService;
    if (socketService) {
      await socketService.emitGameUpdate(gameId, actorUserId);
      await socketService.emitGameResultsUpdated(gameId, actorUserId);
    }
  }
}

/**
 * Gender rules are checked against the roster the substitute is joining — the outgoing
 * player is excluded, otherwise their own seat counts against the incoming player and a
 * like-for-like swap would be rejected as full.
 */
async function assertSubstituteGenderEligible(
  game: GameWithParticipants,
  outUserId: string,
  inUserId: string,
): Promise<void> {
  await validateGenderForGame(
    {
      ...game,
      participants: game.participants?.filter((p) => p.userId !== outUserId),
    },
    inUserId,
    { targetIsOtherUser: true },
  );
}

/**
 * Rewrites the player on every match side of the game, scored or not, so results are
 * attributed wholly to the substitute. `TeamPlayer` is unique per `(teamId, userId)`, so a
 * side that somehow already lists the substitute drops the outgoing row instead.
 */
async function rewriteMatchRosters(
  tx: Prisma.TransactionClient,
  gameId: string,
  outUserId: string,
  inUserId: string,
): Promise<void> {
  const rows = await tx.teamPlayer.findMany({
    where: { userId: outUserId, team: { match: { round: { gameId } } } },
    select: { id: true, teamId: true },
  });
  if (rows.length === 0) return;

  const teamIds = rows.map((row) => row.teamId);
  const existingIncoming = await tx.teamPlayer.findMany({
    where: { userId: inUserId, teamId: { in: teamIds } },
    select: { teamId: true },
  });
  const alreadyOnTeam = new Set(existingIncoming.map((row) => row.teamId));

  for (const row of rows) {
    if (alreadyOnTeam.has(row.teamId)) {
      await tx.teamPlayer.delete({ where: { id: row.id } });
      continue;
    }
    await tx.teamPlayer.update({ where: { id: row.id }, data: { userId: inUserId } });
  }
}

/**
 * Updates the fixed-team membership in place so `GameTeam.id` survives — match sides link
 * back to it through `Team.metadata.gameTeamId`, which a delete-and-recreate would orphan.
 */
async function rewriteFixedTeamSlots(
  tx: Prisma.TransactionClient,
  gameId: string,
  outUserId: string,
  inUserId: string,
): Promise<void> {
  const rows = await tx.gameTeamPlayer.findMany({
    where: { userId: outUserId, gameTeam: { gameId } },
    select: { id: true, gameTeamId: true },
  });
  if (rows.length === 0) return;

  const gameTeamIds = rows.map((row) => row.gameTeamId);
  const existingIncoming = await tx.gameTeamPlayer.findMany({
    where: { userId: inUserId, gameTeamId: { in: gameTeamIds } },
    select: { gameTeamId: true },
  });
  const alreadyOnTeam = new Set(existingIncoming.map((row) => row.gameTeamId));

  for (const row of rows) {
    if (alreadyOnTeam.has(row.gameTeamId)) {
      await tx.gameTeamPlayer.delete({ where: { id: row.id } });
      continue;
    }
    await tx.gameTeamPlayer.update({ where: { id: row.id }, data: { userId: inUserId } });
  }
}
