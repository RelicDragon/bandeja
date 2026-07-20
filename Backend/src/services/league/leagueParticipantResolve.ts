import { LeagueParticipantType, Prisma } from '@prisma/client';
import { findLeagueTeamIdByRosterAlias } from './leagueTeamRosterAlias.util';

export function sortedPlayerKey(userIds: string[]): string {
  return [...userIds].sort().join(':');
}

export function rostersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((id, idx) => id === sb[idx]);
}

type LeagueTeamWithPlayers = {
  id: string;
  players: { userId: string }[];
};

type TeamParticipantWithTeam = {
  id: string;
  leagueTeamId: string | null;
  currentGroupId: string | null;
  leagueTeam: LeagueTeamWithPlayers | null;
};

export async function findLeagueTeamByExactRoster(
  tx: Prisma.TransactionClient,
  teamPlayerIds: string[],
): Promise<LeagueTeamWithPlayers | null> {
  const sorted = [...teamPlayerIds].sort();
  if (sorted.length !== 2) return null;

  const memberships = await tx.leagueTeamPlayer.findMany({
    where: { userId: { in: sorted } },
    select: { leagueTeamId: true, userId: true },
  });

  const playersByTeam = new Map<string, Set<string>>();
  for (const row of memberships) {
    let set = playersByTeam.get(row.leagueTeamId);
    if (!set) {
      set = new Set();
      playersByTeam.set(row.leagueTeamId, set);
    }
    set.add(row.userId);
  }

  for (const [teamId, userIds] of playersByTeam) {
    if (userIds.size !== sorted.length) continue;
    if (!sorted.every((id) => userIds.has(id))) continue;
    const team = await tx.leagueTeam.findUnique({
      where: { id: teamId },
      include: { players: true },
    });
    if (team && team.players.length === sorted.length) {
      return team;
    }
  }

  return null;
}

export async function findTeamParticipantByRoster(
  tx: Prisma.TransactionClient,
  leagueSeasonId: string,
  teamPlayerIds: string[],
): Promise<TeamParticipantWithTeam | null> {
  const participants = await tx.leagueParticipant.findMany({
    where: {
      leagueSeasonId,
      participantType: LeagueParticipantType.TEAM,
    },
    include: {
      leagueTeam: {
        include: { players: true },
      },
    },
  });

  for (const participant of participants) {
    if (!participant.leagueTeam) continue;
    const standingIds = participant.leagueTeam.players.map((p) => p.userId);
    if (rostersEqual(standingIds, teamPlayerIds)) {
      return participant;
    }
  }

  const aliasedTeamId = await findLeagueTeamIdByRosterAlias(tx, leagueSeasonId, teamPlayerIds);
  if (!aliasedTeamId) {
    return null;
  }

  return (
    participants.find((p) => p.leagueTeamId === aliasedTeamId) ??
    (await tx.leagueParticipant.findFirst({
      where: {
        leagueSeasonId,
        participantType: LeagueParticipantType.TEAM,
        leagueTeamId: aliasedTeamId,
      },
      include: {
        leagueTeam: {
          include: { players: true },
        },
      },
    }))
  );
}

export async function findOrCreateLeagueTeamByRoster(
  tx: Prisma.TransactionClient,
  teamPlayerIds: string[],
): Promise<LeagueTeamWithPlayers> {
  const sorted = [...teamPlayerIds].sort();
  if (sorted.length !== 2) {
    throw new Error('League team roster must contain exactly two players');
  }

  const existing = await findLeagueTeamByExactRoster(tx, sorted);
  if (existing) {
    return existing;
  }

  return tx.leagueTeam.create({
    data: {
      players: {
        create: sorted.map((userId) => ({ userId })),
      },
    },
    include: { players: true },
  });
}

export type EnsureTeamParticipantStats = {
  points: number;
  wins: number;
  ties: number;
  losses: number;
  scoreDelta: number;
};

export async function ensureTeamLeagueParticipant(
  tx: Prisma.TransactionClient,
  params: {
    leagueId: string;
    leagueSeasonId: string;
    teamPlayerIds: string[];
    leagueGroupId?: string | null;
    stats?: EnsureTeamParticipantStats;
    useIncrement?: boolean;
  },
): Promise<{ participantId: string; created: boolean }> {
  const { leagueId, leagueSeasonId, teamPlayerIds, leagueGroupId, stats, useIncrement } = params;

  let participant = await findTeamParticipantByRoster(tx, leagueSeasonId, teamPlayerIds);
  const leagueTeam =
    participant?.leagueTeam ?? (await findOrCreateLeagueTeamByRoster(tx, teamPlayerIds));

  if (participant) {
    const data: Prisma.LeagueParticipantUpdateInput = {};
    if (leagueGroupId != null && leagueGroupId !== '') {
      data.currentGroup = { connect: { id: leagueGroupId } };
    }
    if (stats) {
      if (useIncrement) {
        data.points = { increment: stats.points };
        data.wins = { increment: stats.wins };
        data.ties = { increment: stats.ties };
        data.losses = { increment: stats.losses };
        data.scoreDelta = { increment: stats.scoreDelta };
      } else {
        Object.assign(data, stats);
      }
    }
    if (participant.leagueTeamId !== leagueTeam.id) {
      data.leagueTeam = { connect: { id: leagueTeam.id } };
    }
    await tx.leagueParticipant.update({
      where: { id: participant.id },
      data,
    });
    return { participantId: participant.id, created: false };
  }

  const created = await tx.leagueParticipant.create({
    data: {
      leagueId,
      leagueSeasonId,
      participantType: LeagueParticipantType.TEAM,
      leagueTeamId: leagueTeam.id,
      currentGroupId: leagueGroupId ?? undefined,
      points: stats?.points ?? 0,
      wins: stats?.wins ?? 0,
      ties: stats?.ties ?? 0,
      losses: stats?.losses ?? 0,
      scoreDelta: stats?.scoreDelta ?? 0,
    },
  });

  return { participantId: created.id, created: true };
}

export async function findUserParticipant(
  tx: Prisma.TransactionClient,
  leagueSeasonId: string,
  userId: string,
) {
  return tx.leagueParticipant.findFirst({
    where: {
      leagueSeasonId,
      userId,
      participantType: LeagueParticipantType.USER,
    },
  });
}

export async function ensureUserLeagueParticipant(
  tx: Prisma.TransactionClient,
  params: {
    leagueId: string;
    leagueSeasonId: string;
    userId: string;
    leagueGroupId?: string | null;
    stats?: EnsureTeamParticipantStats;
    useIncrement?: boolean;
  },
): Promise<{ participantId: string; created: boolean }> {
  const { leagueId, leagueSeasonId, userId, leagueGroupId, stats, useIncrement } = params;

  const existing = await findUserParticipant(tx, leagueSeasonId, userId);

  if (existing) {
    const data: Prisma.LeagueParticipantUpdateInput = {};
    if (leagueGroupId != null && leagueGroupId !== '') {
      data.currentGroup = { connect: { id: leagueGroupId } };
    }
    if (stats) {
      if (useIncrement) {
        data.points = { increment: stats.points };
        data.wins = { increment: stats.wins };
        data.ties = { increment: stats.ties };
        data.losses = { increment: stats.losses };
        data.scoreDelta = { increment: stats.scoreDelta };
      } else {
        Object.assign(data, stats);
      }
    }
    await tx.leagueParticipant.update({ where: { id: existing.id }, data });
    return { participantId: existing.id, created: false };
  }

  const created = await tx.leagueParticipant.create({
    data: {
      leagueId,
      leagueSeasonId,
      participantType: LeagueParticipantType.USER,
      userId,
      currentGroupId: leagueGroupId ?? undefined,
      points: stats?.points ?? 0,
      wins: stats?.wins ?? 0,
      ties: stats?.ties ?? 0,
      losses: stats?.losses ?? 0,
      scoreDelta: stats?.scoreDelta ?? 0,
    },
  });

  return { participantId: created.id, created: true };
}
