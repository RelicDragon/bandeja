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

/**
 * What a pair-leaderboard row offers the viewer:
 * - `available`: someone else's complete user team the viewer can challenge;
 * - `notTeam`: an ad-hoc pair (no formal two-person team) — nothing to challenge;
 * - `sharesPlayer`: every complete pair of the viewer's shares a player with it;
 * - `null`: nothing to show (the viewer's own pair, or a viewer with no complete
 *   pair — the board explains that once, not on every row).
 */
export type PairRowChallengeState = 'available' | 'notTeam' | 'sharesPlayer' | null;

export function pairRowChallengeState(
  viewerId: string | undefined,
  viewerReadyPairs: readonly UserTeam[],
  entry: { teamId: string | null; isViewerPair: boolean; userA: { id: string }; userB: { id: string } },
): PairRowChallengeState {
  if (!viewerId || entry.isViewerPair || viewerReadyPairs.length === 0) return null;
  if (entry.userA.id === viewerId || entry.userB.id === viewerId) return null;
  if (!entry.teamId) return 'notTeam';
  const target = new Set([entry.userA.id, entry.userB.id]);
  const free = viewerReadyPairs.some((team) => !acceptedMemberIds(team).some((id) => target.has(id)));
  return free ? 'available' : 'sharesPlayer';
}

/**
 * The viewer's two-person team that is still waiting for a partner (no complete
 * pair yet) — the board hint links to it instead of offering to create another.
 */
export function viewerPendingPair(
  viewerId: string | undefined,
  memberships: UserTeamMembership[],
  teams: UserTeam[],
): UserTeam | null {
  if (!viewerId) return null;
  const candidates = [
    ...teams,
    ...memberships.filter((m) => m.userId === viewerId && m.status === 'ACCEPTED' && m.team).map((m) => m.team!),
  ];
  return (
    candidates.find(
      (team) =>
        team.size === 2 &&
        !isReady(team) &&
        (team.members ?? []).some((m) => m.userId === viewerId && m.status === 'ACCEPTED'),
    ) ?? null
  );
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
