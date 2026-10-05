/**
 * Pair challenge — one user team challenges another to a 2v2 GAME.
 *
 * Deliberately no new model and no parallel invite system: the challenger pair
 * goes in through `addUserTeamToGame` (seat / tag / invite the partner, fixed
 * teams when ready), then every accepted member of the challenged pair gets an
 * ordinary game invite through `sendInviteAsUser` with `inviteUserTeamId`. Accept
 * and decline are the existing invite actions; once both challenged members
 * accept, `applyUserTeamToFixedTeamsIfReady` seats them as the second fixed team.
 *
 * Ordering matters: the challenger rows are stamped before the invites go out,
 * so the invite push/Telegram/app card can recognise the challenge from the
 * participant rows (`deriveInviteChallenge` in `@bandeja/shared/userTeamChallenge`).
 */
import { isChallengeableGame } from '@bandeja/shared/userTeamChallenge';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  SOCIAL_GRAPH_INTERACT_CONTEXT,
  assertCanInteract,
} from '../social-graph/socialGraph.block';
import { sendInviteAsUser } from '../invite/sendInviteAsUser.service';
import { validateGameCanAcceptParticipants, validateGenderForGame } from '../../utils/participantValidation';
import { addUserTeamToGame } from './userTeamAddToGame.service';
import { acceptedMemberUserIds } from './userTeamReady';
import { assertChallengePairs, type ChallengeTeamShape } from './userTeamChallengeRules';

export type ChallengeUserTeamResult = {
  gameId: string;
  /** Both challenger members are PLAYING and paired in a fixed team. */
  challengerPairSeated: boolean;
  /** The challenger's partner got an invite (was not on the game yet). */
  challengerPartnerInvited: boolean;
  /** Challenged members who got a new invite. */
  invitedUserIds: string[];
  /** Challenged members already on the game (re-tagged to their team, no new invite). */
  alreadyInGameUserIds: string[];
};

async function loadTeam(teamId: string): Promise<ChallengeTeamShape> {
  const team = await prisma.userTeam.findUnique({
    where: { id: teamId },
    select: { id: true, size: true, members: { select: { userId: true, status: true } } },
  });
  if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
  return team;
}

export async function challengeUserTeam(input: {
  challengedTeamId: string;
  challengerTeamId: string;
  viewerId: string;
  isAdmin: boolean;
  gameId: string;
}): Promise<ChallengeUserTeamResult> {
  const { challengedTeamId, challengerTeamId, viewerId, isAdmin, gameId } = input;

  const [challenger, challenged] = await Promise.all([loadTeam(challengerTeamId), loadTeam(challengedTeamId)]);
  assertChallengePairs(viewerId, challenger, challenged);

  const challengedIds = acceptedMemberUserIds(challenged);
  for (const opponentId of challengedIds) {
    await assertCanInteract(viewerId, opponentId, SOCIAL_GRAPH_INTERACT_CONTEXT.USER_TEAM);
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      entityType: true,
      maxParticipants: true,
      status: true,
      resultsStatus: true,
      genderTeams: true,
      participants: { select: { userId: true, status: true, user: { select: { gender: true } } } },
    },
  });
  if (!game) throw new ApiError(404, 'errors.invites.gameNotFound');
  if (!isChallengeableGame(game)) {
    throw new ApiError(400, 'errors.userTeams.challengeGameNotEligible');
  }
  validateGameCanAcceptParticipants(game);
  // Fail before anything is written: an opponent the game's gender rule refuses
  // must not leave the challenger pair half-added.
  const onGame = new Set(game.participants.map((p) => p.userId));
  for (const opponentId of challengedIds) {
    if (!onGame.has(opponentId)) {
      await validateGenderForGame(game, opponentId, { targetIsOtherUser: true });
    }
  }

  // Seat the challenger pair first: it runs the invite-permission and roster-lock
  // gates, and its stamp is what marks the opponents' invites as a challenge.
  const own = await addUserTeamToGame(challengerTeamId, viewerId, isAdmin, gameId);

  const invitedUserIds: string[] = [];
  const alreadyInGameUserIds: string[] = [];
  for (const receiverId of challengedIds) {
    const sent = await sendInviteAsUser(
      { userId: viewerId, isAdmin },
      { gameId, receiverId, inviteUserTeamId: challengedTeamId },
    );
    if (sent.kind === 'created') invitedUserIds.push(receiverId);
    else alreadyInGameUserIds.push(receiverId);
  }

  return {
    gameId,
    challengerPairSeated: own.pairSeated,
    challengerPartnerInvited: own.invitedUserIds.length > 0,
    invitedUserIds,
    alreadyInGameUserIds,
  };
}
