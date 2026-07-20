import { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { rostersEqual, sortedPlayerKey } from './leagueParticipantResolve';

export async function findLeagueTeamIdByRosterAlias(
  tx: Prisma.TransactionClient,
  leagueSeasonId: string,
  teamPlayerIds: string[],
): Promise<string | null> {
  const rosterKey = sortedPlayerKey(teamPlayerIds);
  if (!rosterKey) return null;
  const alias = await tx.leagueTeamRosterAlias.findUnique({
    where: {
      leagueSeasonId_rosterKey: { leagueSeasonId, rosterKey },
    },
    select: { leagueTeamId: true },
  });
  return alias?.leagueTeamId ?? null;
}

/** Season rosterKey (`id1:id2`) → current franchise leagueTeamId. */
export async function loadSeasonRosterAliasMap(
  tx: Prisma.TransactionClient | typeof import('../../config/database').default,
  leagueSeasonId: string,
): Promise<Map<string, string>> {
  const rows = await tx.leagueTeamRosterAlias.findMany({
    where: { leagueSeasonId },
    select: { rosterKey: true, leagueTeamId: true },
  });
  return new Map(rows.map((r) => [r.rosterKey, r.leagueTeamId]));
}

/**
 * Map a fixture roster to the franchise's *current* player ids.
 * Prefer an exact current-season roster match over aliases so a recycled pair
 * is not rewritten to another franchise.
 */
export async function resolveRosterToCurrentTeamPlayers(
  tx: Prisma.TransactionClient | typeof import('../../config/database').default,
  leagueSeasonId: string,
  teamPlayerIds: string[],
): Promise<string[]> {
  const sorted = [...teamPlayerIds].sort();
  if (sorted.length !== 2) return sorted;

  const participants = await tx.leagueParticipant.findMany({
    where: {
      leagueSeasonId,
      participantType: 'TEAM',
    },
    select: {
      leagueTeam: {
        select: { players: { select: { userId: true } } },
      },
    },
  });

  for (const p of participants) {
    const ids = p.leagueTeam?.players.map((pl) => pl.userId) ?? [];
    if (rostersEqual(ids, sorted)) {
      return sorted;
    }
  }

  const aliasTeamId = await findLeagueTeamIdByRosterAlias(tx as Prisma.TransactionClient, leagueSeasonId, sorted);
  if (!aliasTeamId) {
    return sorted;
  }
  const team = await tx.leagueTeam.findUnique({
    where: { id: aliasTeamId },
    select: { players: { select: { userId: true } } },
  });
  if (!team?.players.length) {
    return sorted;
  }
  return team.players.map((p) => p.userId).sort();
}

export async function upsertRosterAlias(
  tx: Prisma.TransactionClient,
  params: {
    leagueSeasonId: string;
    leagueTeamId: string;
    teamPlayerIds: string[];
  },
): Promise<void> {
  const rosterKey = sortedPlayerKey(params.teamPlayerIds);
  if (!rosterKey) return;

  await tx.leagueTeamRosterAlias.upsert({
    where: {
      leagueSeasonId_rosterKey: {
        leagueSeasonId: params.leagueSeasonId,
        rosterKey,
      },
    },
    create: {
      leagueSeasonId: params.leagueSeasonId,
      leagueTeamId: params.leagueTeamId,
      rosterKey,
    },
    update: {
      leagueTeamId: params.leagueTeamId,
    },
  });
}

/**
 * Block swaps whose new pair is already an historical alias for a *different* franchise.
 * Otherwise past fixtures with that roster would be ambiguous.
 */
export async function assertNewRosterNotForeignAlias(
  tx: Prisma.TransactionClient,
  params: {
    leagueSeasonId: string;
    newPlayerIds: string[];
    allowedLeagueTeamIds: string[];
  },
): Promise<void> {
  const rosterKey = sortedPlayerKey(params.newPlayerIds);
  if (!rosterKey) return;
  const alias = await tx.leagueTeamRosterAlias.findUnique({
    where: {
      leagueSeasonId_rosterKey: {
        leagueSeasonId: params.leagueSeasonId,
        rosterKey,
      },
    },
    select: { leagueTeamId: true },
  });
  if (!alias) return;
  if (params.allowedLeagueTeamIds.includes(alias.leagueTeamId)) return;
  throw new ApiError(
    400,
    'This player pair was previously used by another team in this season and cannot be reused',
  );
}
