import type { PairMember, PairRivalry } from '@/api/pairs';
import type { BasicUser, EntityType, Game } from '@/types';

/** `location.state` for `/create-game` opened from a rivalry's **Rematch**. */
export interface RivalryRematchNavigationState {
  entityType: EntityType;
  initialGameData: Partial<Game>;
  invitedPlayerIds: string[];
  invitedPlayers: BasicUser[];
}

/**
 * A pair-sheet member as a `BasicUser`. Only used as the create flow's chip
 * fallback for an invitee missing from the players store (e.g. outside the
 * Browse city) — the store copy wins whenever it exists.
 */
function pairMemberAsBasicUser(member: PairMember): BasicUser {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName ?? undefined,
    avatar: member.avatar,
    level: member.level ?? 0,
    socialLevel: 0,
    gender: 'PREFER_NOT_TO_SAY',
    approvedLevel: false,
    isTrainer: false,
    isPremium: member.isPremium,
    showPremiumStatus: member.showPremiumStatus,
  };
}

/**
 * Rematch = a regular GAME draft with all four invited: the viewer creates it
 * (and is seated as creator), the partner and both opponents arrive as invites.
 * Nothing is sent until the viewer confirms creation.
 */
export function buildRivalryRematchState(input: {
  viewerId: string;
  teamMembers: readonly BasicUser[];
  rivalry: Pick<PairRivalry, 'userA' | 'userB'>;
}): RivalryRematchNavigationState {
  const seen = new Set<string>([input.viewerId]);
  const invitedPlayers: BasicUser[] = [];
  const push = (user: BasicUser) => {
    if (!user.id || seen.has(user.id)) return;
    seen.add(user.id);
    invitedPlayers.push(user);
  };
  for (const member of input.teamMembers) push(member);
  push(pairMemberAsBasicUser(input.rivalry.userA));
  push(pairMemberAsBasicUser(input.rivalry.userB));

  return {
    entityType: 'GAME',
    initialGameData: {},
    invitedPlayerIds: invitedPlayers.map((user) => user.id),
    invitedPlayers,
  };
}
