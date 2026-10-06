import type { BasicUser, UserTeam } from '@/types';
import type { PairEntry, PairMember } from '@/api/pairs';
import { avatarTeamFromFixedTeam } from '@/utils/fixedTeamUserTeam';

/** Only the face fields matter to `TeamAvatar`; the rest are neutral fillers. */
function asBasicUser(member: PairMember): BasicUser {
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
 * A `UserTeam` shaped enough for `TeamAvatar` when the pair has formalized a
 * team (`entry.team`), else `null` and the caller keeps the two faces.
 */
export function pairAvatarTeam(entry: Pick<PairEntry, 'team' | 'userA' | 'userB'>): UserTeam | null {
  if (!entry.team) return null;
  return avatarTeamFromFixedTeam(entry.team, [asBasicUser(entry.userA), asBasicUser(entry.userB)]);
}
