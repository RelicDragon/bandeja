import type { BasicUser, UserTeam, UserTeamMembership } from '@/types';
import type { UserMetadata } from '@/store/playersStore';
import { matchesSearch } from '@/utils/transliteration';
import type { PlayerInviteFilters } from '@/components/playerInvite/playerInviteFilters';
import type { GameAvailabilityMatch } from '@/utils/availability/gameMatch';

export type InviteListEntry =
  | { kind: 'user'; id: string; user: BasicUser }
  | { kind: 'team'; id: string; team: UserTeam; members: BasicUser[] };

export function isUserTeamReady(team: UserTeam): boolean {
  const accepted = (team.members ?? []).filter((m) => m.status === 'ACCEPTED').length;
  return accepted >= team.size;
}

function acceptedMemberUsers(team: UserTeam): BasicUser[] {
  const members = team.members ?? [];
  return members.filter((m) => m.status === 'ACCEPTED').map((m) => m.user).filter(Boolean) as BasicUser[];
}

export function teamInteractionScore(
  team: UserTeam,
  getUserMetadata: (userId: string) => UserMetadata | undefined
): number {
  return acceptedMemberUsers(team).reduce((sum, u) => sum + (getUserMetadata(u.id)?.interactionCount ?? 0), 0);
}

export function teamGamesTogetherScore(
  team: UserTeam,
  getUserMetadata: (userId: string) => UserMetadata | undefined
): number {
  return acceptedMemberUsers(team).reduce((sum, u) => sum + (getUserMetadata(u.id)?.gamesTogetherCount ?? 0), 0);
}

export function teamAverageLevel(team: UserTeam): number {
  const users = acceptedMemberUsers(team);
  if (users.length === 0) return 0;
  const sum = users.reduce((s, u) => s + (typeof u.level === 'number' ? u.level : 0), 0);
  return sum / users.length;
}

export function teamAverageSocial(team: UserTeam): number {
  const users = acceptedMemberUsers(team);
  if (users.length === 0) return 0;
  const sum = users.reduce((s, u) => s + (typeof u.socialLevel === 'number' ? u.socialLevel : 0), 0);
  return sum / users.length;
}

export function teamAverageReliability(team: UserTeam): number | undefined {
  const users = acceptedMemberUsers(team);
  if (users.length === 0) return undefined;
  const rels = users
    .map((u) => u.reliability)
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r));
  if (rels.length === 0) return undefined;
  return rels.reduce((a, b) => a + b, 0) / rels.length;
}

/** Strict: every accepted member must match MALE or FEMALE; excludes PREFER_NOT_TO_SAY / unknown under non-ALL filters. */
export function teamPassesStrictGenderFilter(team: UserTeam, genderApply: 'ALL' | 'MALE' | 'FEMALE'): boolean {
  if (genderApply === 'ALL') return true;
  const users = acceptedMemberUsers(team);
  if (users.length === 0) return false;
  return users.every((u) => u.gender === genderApply);
}

export function teamMatchesSearch(team: UserTeam, query: string): boolean {
  if (!query.trim()) return true;
  if (matchesSearch(query, team.name)) return true;
  return acceptedMemberUsers(team).some((u) => matchesSearch(query, `${u.firstName || ''} ${u.lastName || ''}`));
}

export function teamIsFullyInvitable(
  team: UserTeam,
  participantIds: Set<string>,
  invitedUserIds: Set<string>,
  filterPlayerIds: string[]
): boolean {
  const filter = new Set(filterPlayerIds);
  const users = acceptedMemberUsers(team);
  for (const u of users) {
    if (participantIds.has(u.id)) return false;
    if (invitedUserIds.has(u.id)) return false;
    if (filter.has(u.id)) return false;
  }
  return users.length > 0;
}

export function mergeUserTeamsForInviteList(teams: UserTeam[], memberships: UserTeamMembership[]): UserTeam[] {
  const byId = new Map<string, UserTeam>();
  for (const t of teams) byId.set(t.id, t);
  for (const m of memberships) {
    if (m.team && !byId.has(m.team.id)) byId.set(m.team.id, m.team);
  }
  return [...byId.values()];
}

export function filterAndSortInviteEntries(
  users: BasicUser[],
  readyTeams: UserTeam[],
  opts: {
    searchQuery: string;
    filterPlayerIds: string[];
    filters: PlayerInviteFilters;
    filterGender?: 'MALE' | 'FEMALE';
    inviteAsTrainerOnly: boolean;
    isFavorite: (id: string) => boolean;
    getUserMetadata: (id: string) => UserMetadata | undefined;
    showTeams: boolean;
    getAvailabilityMatch?: (entry: InviteListEntry) => GameAvailabilityMatch;
  }
): InviteListEntry[] {
  let uList = users;
  if (opts.inviteAsTrainerOnly) {
    uList = uList.filter((p) => p.isTrainer === true);
  }

  const genderApply = opts.filterGender ?? opts.filters.gender;
  uList = uList.filter((player) => {
    if (genderApply === 'ALL') {
      return player.gender === 'MALE' || player.gender === 'FEMALE' || player.gender === 'PREFER_NOT_TO_SAY';
    }
    return player.gender === genderApply;
  });

  if (opts.filterPlayerIds.length > 0) {
    uList = uList.filter((p) => !opts.filterPlayerIds.includes(p.id));
  }

  if (opts.searchQuery.trim()) {
    uList = uList.filter((player) => matchesSearch(opts.searchQuery, `${player.firstName || ''} ${player.lastName || ''}`));
  }

  const [lMin, lMax] = opts.filters.levelRange;
  const [sMin, sMax] = opts.filters.socialRange;
  uList = uList.filter((p) => {
    const lv = typeof p.level === 'number' ? p.level : 0;
    const sv = typeof p.socialLevel === 'number' ? p.socialLevel : 0;
    return lv >= lMin && lv <= lMax && sv >= sMin && sv <= sMax;
  });

  if (opts.filters.minGamesTogether > 0) {
    uList = uList.filter((p) => {
      const c = opts.getUserMetadata(p.id)?.gamesTogetherCount ?? 0;
      return c >= opts.filters.minGamesTogether;
    });
  }

  const userEntries: InviteListEntry[] = uList.map((user) => ({ kind: 'user', id: user.id, user }));

  let teamEntries: InviteListEntry[] = [];
  if (opts.showTeams) {
    let tList = readyTeams.filter((t) => isUserTeamReady(t));
    if (genderApply !== 'ALL') {
      tList = tList.filter((t) => teamPassesStrictGenderFilter(t, genderApply));
    }
    if (opts.filterPlayerIds.length > 0) {
      tList = tList.filter((t) => !opts.filterPlayerIds.some((id) => acceptedMemberUsers(t).some((u) => u.id === id)));
    }
    if (opts.searchQuery.trim()) {
      tList = tList.filter((t) => teamMatchesSearch(t, opts.searchQuery));
    }
    tList = tList.filter((t) => {
      const lv = teamAverageLevel(t);
      const sv = teamAverageSocial(t);
      return lv >= lMin && lv <= lMax && sv >= sMin && sv <= sMax;
    });
    if (opts.filters.minGamesTogether > 0) {
      tList = tList.filter((t) => teamGamesTogetherScore(t, opts.getUserMetadata) >= opts.filters.minGamesTogether);
    }
    teamEntries = tList.map((team) => ({
      kind: 'team',
      id: team.id,
      team,
      members: acceptedMemberUsers(team),
    }));
  }

  const combined = [...userEntries, ...teamEntries];

  const availabilityRank = (match: GameAvailabilityMatch): number =>
    match === 'full' ? 0 : match === 'partial' ? 1 : 2;

  return combined.sort((a, b) => {
    if (opts.getAvailabilityMatch) {
      const aA = availabilityRank(opts.getAvailabilityMatch(a));
      const bA = availabilityRank(opts.getAvailabilityMatch(b));
      if (aA !== bA) return aA - bA;
    }
    const aFav =
      a.kind === 'user' ? opts.isFavorite(a.user.id) : a.members.some((m) => opts.isFavorite(m.id));
    const bFav =
      b.kind === 'user' ? opts.isFavorite(b.user.id) : b.members.some((m) => opts.isFavorite(m.id));
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    const aI = a.kind === 'user' ? opts.getUserMetadata(a.user.id)?.interactionCount ?? 0 : teamInteractionScore(a.team, opts.getUserMetadata);
    const bI = b.kind === 'user' ? opts.getUserMetadata(b.user.id)?.interactionCount ?? 0 : teamInteractionScore(b.team, opts.getUserMetadata);
    if (bI !== aI) return bI - aI;
    const aG =
      a.kind === 'user' ? opts.getUserMetadata(a.user.id)?.gamesTogetherCount ?? 0 : teamGamesTogetherScore(a.team, opts.getUserMetadata);
    const bG =
      b.kind === 'user' ? opts.getUserMetadata(b.user.id)?.gamesTogetherCount ?? 0 : teamGamesTogetherScore(b.team, opts.getUserMetadata);
    return bG - aG;
  });
}

export function expandSelectionToPlayerIds(
  selectedUserIds: string[],
  selectedTeamIds: string[],
  teamById: Map<string, UserTeam>
): { playerIds: string[]; userTeamIdByReceiverId: Record<string, string> } {
  const userTeamIdByReceiverId: Record<string, string> = {};
  const out: string[] = [];
  const seen = new Set<string>();

  for (const tid of selectedTeamIds) {
    const team = teamById.get(tid);
    if (!team) continue;
    for (const m of team.members ?? []) {
      if (m.status !== 'ACCEPTED') continue;
      const id = m.userId;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      userTeamIdByReceiverId[id] = tid;
    }
  }

  for (const uid of selectedUserIds) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }

  return { playerIds: out, userTeamIdByReceiverId };
}

export function invitePreFilterCount(
  players: BasicUser[],
  readyTeams: UserTeam[],
  opts: {
    inviteAsTrainerOnly: boolean;
    filterPlayerIds: string[];
    showTeams: boolean;
    filterGender?: 'MALE' | 'FEMALE';
    filtersGender?: PlayerInviteFilters['gender'];
    /** When false, user rows are excluded from the pre-filter total (list segment off). Default true. */
    segmentUsers?: boolean;
    /** When false, team rows are excluded. Default true. Ignored when showTeams is false. */
    segmentTeams?: boolean;
  }
): number {
  const segUsers = opts.segmentUsers !== false;
  const segTeams = opts.segmentTeams !== false;

  let u = players;
  if (opts.inviteAsTrainerOnly) u = u.filter((p) => p.isTrainer === true);
  if (opts.filterPlayerIds.length > 0) u = u.filter((p) => !opts.filterPlayerIds.includes(p.id));
  const genderApply = opts.filterGender ?? opts.filtersGender ?? 'ALL';
  if (genderApply !== 'ALL') {
    u = u.filter((p) => p.gender === genderApply);
  }
  let c = segUsers ? u.length : 0;
  if (opts.showTeams && segTeams) {
    let teams = readyTeams.filter((t) => isUserTeamReady(t));
    if (opts.filterPlayerIds.length > 0) {
      teams = teams.filter((t) => !opts.filterPlayerIds.some((id) => acceptedMemberUsers(t).some((m) => m.id === id)));
    }
    if (genderApply !== 'ALL') {
      teams = teams.filter((t) => teamPassesStrictGenderFilter(t, genderApply));
    }
    c += teams.length;
  }
  return c;
}
