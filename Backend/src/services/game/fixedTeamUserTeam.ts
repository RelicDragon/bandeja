import { UserTeamMemberStatus } from '@prisma/client';
import prisma from '../../config/database';

/**
 * A game's fixed team ↔ the players' own `UserTeam`.
 *
 * League fixtures and playoffs create `GameTeam` rows without a name, so the
 * matchup card fell back to "Team 1 / Team 2" even when the pair has a named
 * team. A `UserTeam` matches a fixed team when its ACCEPTED members are exactly
 * that team's players and the team is full (`size`). `avatar` is only ever the
 * owner's upload — the half-by-half face is drawn client-side, never stored.
 *
 * Exposure matches `applyUserTeamToFixedTeamsIfReady`, which already copies a
 * ready team's name onto the public `GameTeam.name`.
 */
export type FixedTeamUserTeam = { id: string; name: string; avatar: string | null };

export type UserTeamCandidate = {
  id: string;
  name: string;
  avatar: string | null;
  size: number;
  updatedAt: Date;
  acceptedMemberIds: string[];
};

function sameIdSet(a: string[], b: Set<string>): boolean {
  const unique = new Set(a);
  if (unique.size !== b.size) return false;
  for (const id of unique) if (!b.has(id)) return false;
  return true;
}

/**
 * Several pairs can own a team with the same two members (each partner made
 * one). Prefer the one with an uploaded avatar, then the most recently edited,
 * then id — deterministic across reloads.
 */
export function pickUserTeamForRoster(
  rosterIds: string[],
  candidates: UserTeamCandidate[],
): FixedTeamUserTeam | null {
  const roster = new Set(rosterIds);
  if (roster.size < 2) return null;
  const matches = candidates.filter(
    (c) => c.size === roster.size && sameIdSet(c.acceptedMemberIds, roster),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const avatarRank = Number(Boolean(b.avatar)) - Number(Boolean(a.avatar));
    if (avatarRank !== 0) return avatarRank;
    const updated = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updated !== 0) return updated;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const best = matches[0];
  return { id: best.id, name: best.name, avatar: best.avatar ?? null };
}

type FixedTeamLike = { players?: Array<{ userId?: string | null }> | null; [key: string]: unknown };

export async function attachUserTeamsToFixedTeams<T extends { fixedTeams?: FixedTeamLike[] | null }>(
  game: T,
): Promise<T> {
  const teams = game.fixedTeams ?? [];
  const rosters = teams.map((t) =>
    (t.players ?? []).map((p) => p.userId).filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  const allIds = [...new Set(rosters.flat())];
  if (!rosters.some((r) => new Set(r).size >= 2)) return game;

  const rows = await prisma.userTeam.findMany({
    where: {
      members: { some: { userId: { in: allIds }, status: UserTeamMemberStatus.ACCEPTED } },
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      size: true,
      updatedAt: true,
      members: { where: { status: UserTeamMemberStatus.ACCEPTED }, select: { userId: true } },
    },
  });
  const candidates: UserTeamCandidate[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    size: r.size,
    updatedAt: r.updatedAt,
    acceptedMemberIds: r.members.map((m) => m.userId),
  }));

  return {
    ...game,
    fixedTeams: teams.map((team, i) => ({
      ...team,
      userTeam: pickUserTeamForRoster(rosters[i], candidates),
    })),
  };
}
