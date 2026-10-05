import { UserTeamMemberStatus } from '@prisma/client';
import prisma from '../../config/database';

/**
 * A game's fixed team ↔ the players' own `UserTeam`.
 *
 * League fixtures and playoffs create `GameTeam` rows without a name, so the
 * matchup card fell back to "Team 1 / Team 2" even when the pair has a named
 * team. A `UserTeam` matches a fixed team when its ACCEPTED members are exactly
 * that team's players and the team is full (`size`). `avatar` is only ever the
 * owner's upload — the half-by-half face is drawn client-side (from `ownerId`,
 * `cutAngle`, `color` and the fixed team's own players), never stored.
 *
 * Exposure matches `applyUserTeamToFixedTeamsIfReady`, which already copies a
 * ready team's name onto the public `GameTeam.name`. Added fields only: store
 * builds ignore `userTeam`.
 */
export type FixedTeamUserTeam = {
  id: string;
  name: string;
  avatar: string | null;
  cutAngle: number;
  /** Palette key from `@bandeja/shared/userTeamColors`; null = app default colour. */
  color: string | null;
  /** Owner paints the first half of the split face. */
  ownerId: string;
};

export type UserTeamCandidate = {
  id: string;
  name: string;
  avatar: string | null;
  cutAngle: number;
  color: string | null;
  ownerId: string;
  size: number;
  updatedAt: Date;
  acceptedMemberIds: string[];
};

/** What the game itself says about which team this pair is (both optional). */
export type RosterHints = {
  /** `GameTeam.name` — copied from the `UserTeam` when the pair was seated as a team. */
  teamName?: string | null;
  /** `GameParticipant.inviteUserTeamId` of the roster's players (set while a team invite is pending/queued). */
  inviteUserTeamIds?: ReadonlyArray<string | null | undefined>;
};

function sameIdSet(a: string[], b: Set<string>): boolean {
  const unique = new Set(a);
  if (unique.size !== b.size) return false;
  for (const id of unique) if (!b.has(id)) return false;
  return true;
}

function normName(name: string | null | undefined): string {
  return (name ?? '').trim().toLocaleLowerCase();
}

/**
 * Several pairs can own a team with the same two members (each partner made
 * one). Tie-break, deterministic across reloads:
 * 1. the team the game names (`GameTeam.name` equals the team's name — it was
 *    copied there when the pair joined as that team);
 * 2. the team the roster was invited as (`inviteUserTeamId`);
 * 3. an uploaded avatar;
 * 4. the most recently edited (`updatedAt`);
 * 5. id.
 */
export function pickUserTeamForRoster(
  rosterIds: string[],
  candidates: UserTeamCandidate[],
  hints: RosterHints = {},
): FixedTeamUserTeam | null {
  const roster = new Set(rosterIds);
  if (roster.size < 2) return null;
  const matches = candidates.filter(
    (c) => c.size === roster.size && sameIdSet(c.acceptedMemberIds, roster),
  );
  if (matches.length === 0) return null;
  const wantedName = normName(hints.teamName);
  const invitedAs = new Set((hints.inviteUserTeamIds ?? []).filter((id): id is string => !!id));
  const rank = (c: UserTeamCandidate) => [
    wantedName && normName(c.name) === wantedName ? 1 : 0,
    invitedAs.has(c.id) ? 1 : 0,
    c.avatar ? 1 : 0,
    c.updatedAt.getTime(),
  ];
  matches.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] !== rb[i]) return rb[i] - ra[i];
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const best = matches[0];
  return {
    id: best.id,
    name: best.name,
    avatar: best.avatar ?? null,
    cutAngle: best.cutAngle,
    color: best.color ?? null,
    ownerId: best.ownerId,
  };
}

type FixedTeamLike = {
  name?: string | null;
  players?: Array<{ userId?: string | null }> | null;
};
type ParticipantLike = { userId?: string | null; inviteUserTeamId?: string | null };

function rosterOf(team: FixedTeamLike): string[] {
  return (team.players ?? [])
    .map((p) => p.userId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Adds `userTeam` (or `null`) to each team. One query for the whole list. */
export async function attachUserTeamsToTeamList<T extends FixedTeamLike>(
  teams: T[],
  participants: ParticipantLike[] = [],
): Promise<Array<T & { userTeam: FixedTeamUserTeam | null }>> {
  const rosters = teams.map(rosterOf);
  if (!rosters.some((r) => new Set(r).size >= 2)) {
    return teams.map((team) => ({ ...team, userTeam: null }));
  }
  const allIds = [...new Set(rosters.flat())];

  const rows = await prisma.userTeam.findMany({
    where: {
      members: { some: { userId: { in: allIds }, status: UserTeamMemberStatus.ACCEPTED } },
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      cutAngle: true,
      color: true,
      ownerId: true,
      size: true,
      updatedAt: true,
      members: { where: { status: UserTeamMemberStatus.ACCEPTED }, select: { userId: true } },
    },
  });
  const candidates: UserTeamCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    cutAngle: r.cutAngle,
    color: r.color,
    ownerId: r.ownerId,
    size: r.size,
    updatedAt: r.updatedAt,
    acceptedMemberIds: r.members.map((m) => m.userId),
  }));
  const inviteByUser = new Map<string, string>();
  for (const p of participants) {
    if (p.userId && p.inviteUserTeamId) inviteByUser.set(p.userId, p.inviteUserTeamId);
  }

  return teams.map((team, i) => ({
    ...team,
    userTeam: pickUserTeamForRoster(rosters[i], candidates, {
      teamName: team.name ?? null,
      inviteUserTeamIds: rosters[i].map((id) => inviteByUser.get(id)),
    }),
  }));
}

export async function attachUserTeamsToFixedTeams<
  T extends { fixedTeams?: FixedTeamLike[] | null; participants?: ParticipantLike[] | null },
>(game: T): Promise<T> {
  const teams = game.fixedTeams ?? [];
  if (teams.length === 0) return game;
  return {
    ...game,
    fixedTeams: await attachUserTeamsToTeamList(teams, game.participants ?? []),
  };
}
