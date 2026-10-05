import type { BasicUser, Game, Sport, UserTeam, UserTeamMembership } from '@/types';
import type { UserTeamInvitableGame } from '@/api/userTeams';
import { challengeSeatsFit, isChallengeableGame } from '@shared/userTeamChallenge';

/**
 * Pair challenge, app side. The challenge itself is the ordinary game + invite
 * machinery (`POST /user-teams/:id/challenge`, `@shared/userTeamChallenge`);
 * these helpers only decide who may challenge whom and prefill the create flow.
 */

export function acceptedMemberIds(team: Pick<UserTeam, 'members'>): string[] {
  return (team.members ?? []).filter((m) => m.status === 'ACCEPTED').map((m) => m.userId);
}

function isReady(team: Pick<UserTeam, 'members' | 'size'>): boolean {
  return acceptedMemberIds(team).length >= team.size;
}

/**
 * The viewer's complete pairs (accepted membership, every seat accepted) that
 * share no player with the target. Empty = no Challenge action.
 */
export function challengerTeamsFor(
  viewerId: string | undefined,
  memberships: UserTeamMembership[],
  teams: UserTeam[],
  targetMemberIds: readonly string[],
): UserTeam[] {
  if (!viewerId) return [];
  const byId = new Map<string, UserTeam>();
  for (const team of teams) byId.set(team.id, team);
  for (const m of memberships) {
    if (m.userId === viewerId && m.status === 'ACCEPTED' && m.team) byId.set(m.team.id, m.team);
  }
  const target = new Set(targetMemberIds);
  if (target.has(viewerId)) return [];
  return [...byId.values()].filter((team) => {
    if (team.size !== 2 || !isReady(team)) return false;
    const ids = acceptedMemberIds(team);
    if (!ids.includes(viewerId)) return false;
    return !ids.some((id) => target.has(id));
  });
}

/** Existing games where the challenge fits: a 2v2 GAME with no stranger seated. */
export function isChallengeGameOption(game: UserTeamInvitableGame): boolean {
  if (!isChallengeableGame(game)) return false;
  return challengeSeatsFit(game.playingCount, game.partnerOnGame === 'playing');
}

/** What `CreateGame` needs to know the draft is a challenge (banner + post-create call). */
export interface ChallengeDraft {
  challengerTeamId: string;
  challengedTeamId: string;
  challengerTeamName: string;
  challengedTeamName: string;
}

/** `location.state` for `/create-game` opened from a Challenge action. */
export interface ChallengeNavigationState {
  entityType: 'GAME';
  initialGameData: Partial<Game>;
  invitedPlayerIds: string[];
  invitedPlayers: BasicUser[];
  inviteUserTeamIds: Record<string, string>;
  challenge: ChallengeDraft;
}

function memberUsers(team: UserTeam, ids: string[]): BasicUser[] {
  return ids
    .map((id) => team.members.find((m) => m.userId === id)?.user)
    .filter((u): u is BasicUser => Boolean(u));
}

/**
 * A 2v2 GAME with fixed teams, the partner and both opponents pre-invited as
 * their pairs. Everything else (club, time, format) is the normal create flow.
 */
export function buildChallengeNavigationState(
  viewerId: string,
  challenger: UserTeam,
  challenged: UserTeam,
  sport: Sport | undefined,
): ChallengeNavigationState {
  const partnerIds = acceptedMemberIds(challenger).filter((id) => id !== viewerId);
  const opponentIds = acceptedMemberIds(challenged);
  const inviteUserTeamIds: Record<string, string> = {};
  for (const id of partnerIds) inviteUserTeamIds[id] = challenger.id;
  for (const id of opponentIds) inviteUserTeamIds[id] = challenged.id;
  return {
    entityType: 'GAME',
    initialGameData: {
      ...(sport ? { sport } : {}),
      maxParticipants: 4,
      playersPerMatch: 4,
      hasFixedTeams: true,
    },
    invitedPlayerIds: [...partnerIds, ...opponentIds],
    invitedPlayers: [...memberUsers(challenger, partnerIds), ...memberUsers(challenged, opponentIds)],
    inviteUserTeamIds,
    challenge: {
      challengerTeamId: challenger.id,
      challengedTeamId: challenged.id,
      challengerTeamName: challenger.name,
      challengedTeamName: challenged.name,
    },
  };
}

/**
 * At submit the challenge endpoint is used only while the draft still holds the
 * whole roster it opened with; if the organizer removed someone, the plain
 * invite loop (still carrying `userTeamId`) sends whatever is left.
 */
export function challengeStillIntact(
  draftInviteeIds: readonly string[],
  invitedPlayerIds: readonly string[],
): boolean {
  const current = new Set(invitedPlayerIds);
  return draftInviteeIds.every((id) => current.has(id));
}
