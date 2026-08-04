import {
  BracketScope,
  BracketSlotKind,
  EntityType,
  PlayoffFormat,
  Prisma,
  ResultsStatus,
  RoundType,
  type Sport,
} from '@prisma/client';
import {
  LETO_2026_SEASON_GAME_ID,
  LETO_2026_TIER_ORDER,
  getAchievementDefinition,
  mergeTreePodiumsIntoEventPlaces,
  treeKeysForBracketPodium,
  usesBracketPlacesForEventPodium,
  type AchievementDefinitionId,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { BracketAdvancementService } from '../league/bracketAdvancement.service';

type DbClient = Prisma.TransactionClient | typeof prisma;

export type Leto2026Tier = (typeof LETO_2026_TIER_ORDER)[number];

const TIER_RANK = new Map<Leto2026Tier, number>(
  LETO_2026_TIER_ORDER.map((id, index) => [id, LETO_2026_TIER_ORDER.length - index]),
);

function betterTier(a: Leto2026Tier, b: Leto2026Tier): Leto2026Tier {
  return (TIER_RANK.get(a) ?? 0) >= (TIER_RANK.get(b) ?? 0) ? a : b;
}

async function userIdsForTeamParticipants(
  db: DbClient,
  participantIds: string[],
): Promise<Map<string, string[]>> {
  if (participantIds.length === 0) return new Map();
  const rows = await db.leagueParticipant.findMany({
    where: { id: { in: participantIds } },
    select: {
      id: true,
      userId: true,
      leagueTeam: { select: { players: { select: { userId: true } } } },
    },
  });
  const out = new Map<string, string[]>();
  for (const row of rows) {
    if (row.userId) {
      out.set(row.id, [row.userId]);
      continue;
    }
    const ids = (row.leagueTeam?.players ?? []).map((p) => p.userId);
    out.set(row.id, ids);
  }
  return out;
}

async function resolveSeasonBracketPodiumAndFourth(
  db: DbClient,
  seasonId: string,
): Promise<{
  place1: string[];
  place2: string[];
  place3: string[];
  place4: string[];
}> {
  const empty = { place1: [], place2: [], place3: [], place4: [] as string[] };
  const round = await db.leagueRound.findFirst({
    where: {
      leagueSeasonId: seasonId,
      roundType: RoundType.PLAYOFF,
      playoffFormat: PlayoffFormat.BRACKET,
    },
    orderBy: { orderIndex: 'desc' },
    select: { id: true, bracketScope: true },
  });
  if (!round) return empty;

  const groups =
    round.bracketScope === BracketScope.CROSS_GROUP
      ? []
      : await db.leagueGroup.findMany({
          where: { leagueSeasonId: seasonId },
          select: { id: true },
        });

  if (!usesBracketPlacesForEventPodium(round.bracketScope, groups.length)) {
    return empty;
  }

  const groupIds = treeKeysForBracketPodium(
    round.bracketScope,
    groups.map((g) => g.id),
  );

  const treePodiums: Array<{
    championParticipantId: string | null;
    finalistParticipantId: string | null;
    thirdPlaceParticipantId: string | null;
  }> = [];
  const place4: string[] = [];
  const tx = db as Prisma.TransactionClient;

  for (const leagueGroupId of groupIds) {
    const slots = await db.leagueBracketSlot.findMany({
      where: { leagueRoundId: round.id, leagueGroupId },
      select: {
        id: true,
        slotKind: true,
        roundIndex: true,
        gameId: true,
        winnerSlotId: true,
        feederSlotAId: true,
        game: { select: { resultsStatus: true } },
      },
    });
    if (slots.length === 0) continue;

    const tree = await BracketAdvancementService.resolveTreePodiumFromSlots(slots, tx);
    if (!tree.championParticipantId || !tree.finalistParticipantId) continue;
    treePodiums.push(tree);

    const thirdSlot = slots.find((s) => s.slotKind === BracketSlotKind.THIRD_PLACE);
    if (
      thirdSlot?.gameId &&
      thirdSlot.game?.resultsStatus === ResultsStatus.FINAL
    ) {
      const fourth = await BracketAdvancementService.resolveLoserParticipantId(
        thirdSlot.gameId,
        tx,
      );
      if (fourth) place4.push(fourth);
    }
  }

  const places = mergeTreePodiumsIntoEventPlaces(treePodiums);
  return {
    place1: places.get(1) ?? [],
    place2: places.get(2) ?? [],
    place3: places.get(3) ?? [],
    place4,
  };
}

/**
 * Resolve exclusive best tier per user for Fix Liga Leto 2026.
 * Hierarchy: gold > silver > bronze > 4th > playoffs > participant.
 */
export async function resolveLeto2026Awards(params?: {
  seasonId?: string;
  tx?: DbClient;
}): Promise<Map<string, Leto2026Tier>> {
  const seasonId = params?.seasonId ?? LETO_2026_SEASON_GAME_ID;
  const db = params?.tx ?? prisma;
  const byUser = new Map<string, Leto2026Tier>();

  const bump = (userId: string, tier: Leto2026Tier) => {
    const prev = byUser.get(userId);
    byUser.set(userId, prev ? betterTier(prev, tier) : tier);
  };

  // Current franchise rosters (incl. withdrawn teams still attached).
  const allPlayers = await db.leagueTeamPlayer.findMany({
    where: {
      leagueTeam: {
        participants: { some: { leagueSeasonId: seasonId } },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const row of allPlayers) bump(row.userId, 'leto_2026_participant');

  // Pre-swap roster keys — swap removes the outgoing player from LeagueTeamPlayer.
  const rosterAliases = await db.leagueTeamRosterAlias.findMany({
    where: { leagueSeasonId: seasonId },
    select: { rosterKey: true },
  });
  for (const alias of rosterAliases) {
    for (const userId of alias.rosterKey.split(':')) {
      if (userId) bump(userId, 'leto_2026_participant');
    }
  }

  // Anyone who stayed on a scored fixed-team fixture after being swapped out.
  const historicalFixturePlayers = await db.gameTeamPlayer.findMany({
    where: {
      gameTeam: {
        game: {
          parentId: seasonId,
          entityType: EntityType.LEAGUE,
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const row of historicalFixturePlayers) bump(row.userId, 'leto_2026_participant');

  // Anyone who appeared on a playoff bracket slot (current occupant).
  const playoffSlots = await db.leagueBracketSlot.findMany({
    where: {
      leagueParticipantId: { not: null },
      leagueRound: {
        leagueSeasonId: seasonId,
        roundType: RoundType.PLAYOFF,
      },
    },
    select: { leagueParticipantId: true },
  });
  // Anyone who played a FINAL playoff fixture (covers eliminated rounds where
  // slot.leagueParticipantId was later advanced away).
  const playoffFixturePlayers = await db.teamPlayer.findMany({
    where: {
      team: {
        match: {
          round: {
            game: {
              entityType: EntityType.LEAGUE,
              resultsStatus: ResultsStatus.FINAL,
              leagueRound: {
                leagueSeasonId: seasonId,
                roundType: RoundType.PLAYOFF,
              },
            },
          },
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const row of playoffFixturePlayers) bump(row.userId, 'leto_2026_playoffs');

  const playoffParticipantIds = [
    ...new Set(
      playoffSlots
        .map((s) => s.leagueParticipantId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const playoffUsers = await userIdsForTeamParticipants(db, playoffParticipantIds);
  for (const userIds of playoffUsers.values()) {
    for (const userId of userIds) bump(userId, 'leto_2026_playoffs');
  }

  const podium = await resolveSeasonBracketPodiumAndFourth(db, seasonId);
  const mapPlace = async (participantIds: string[], tier: Leto2026Tier) => {
    const users = await userIdsForTeamParticipants(db, participantIds);
    for (const userIds of users.values()) {
      for (const userId of userIds) bump(userId, tier);
    }
  };
  await mapPlace(podium.place4, 'leto_2026_place4');
  await mapPlace(podium.place3, 'leto_2026_bronze');
  await mapPlace(podium.place2, 'leto_2026_silver');
  await mapPlace(podium.place1, 'leto_2026_gold');

  return byUser;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Silent grant of exclusive Leto 2026 medals (idempotent).
 * Each user receives only their best tier.
 */
export async function grantLeto2026SeasonAchievements(params?: {
  seasonId?: string;
  apply?: boolean;
  userIdFilter?: string | null;
  tx?: DbClient;
}): Promise<{
  planned: Array<{ userId: string; definitionId: Leto2026Tier }>;
  granted: number;
}> {
  const seasonId = params?.seasonId ?? LETO_2026_SEASON_GAME_ID;
  const db = params?.tx ?? prisma;
  const apply = params?.apply ?? false;

  const season = await db.game.findUnique({
    where: { id: seasonId },
    select: {
      id: true,
      name: true,
      sport: true,
      entityType: true,
      finishedDate: true,
      endTime: true,
      startTime: true,
      createdAt: true,
    },
  });
  if (!season || season.entityType !== EntityType.LEAGUE_SEASON) {
    throw new Error(`Season ${seasonId} not found or not LEAGUE_SEASON`);
  }

  const awards = await resolveLeto2026Awards({ seasonId, tx: db });
  const planned: Array<{ userId: string; definitionId: Leto2026Tier }> = [];
  for (const [userId, definitionId] of awards) {
    if (params?.userIdFilter && userId !== params.userIdFilter) continue;
    planned.push({ userId, definitionId });
  }
  planned.sort((a, b) => a.userId.localeCompare(b.userId));

  if (!apply) return { planned, granted: 0 };

  const earnedAt =
    season.finishedDate ?? season.endTime ?? season.startTime ?? season.createdAt;
  const sport = season.sport as Sport;
  let granted = 0;

  for (const row of planned) {
    const definition = getAchievementDefinition(row.definitionId);
    if (!definition) continue;

    // Ensure exclusive: soft-revoke other Leto tiers if any (shouldn't exist).
    await db.userAchievement.updateMany({
      where: {
        userId: row.userId,
        isActive: true,
        definitionId: { in: [...LETO_2026_TIER_ORDER] },
        NOT: { definitionId: row.definitionId },
      },
      data: { isActive: false, revokedAt: new Date() },
    });

    const existing = await db.userAchievement.findFirst({
      where: {
        userId: row.userId,
        definitionId: row.definitionId,
      },
      select: { id: true, isActive: true },
    });
    if (existing?.isActive) continue;
    if (existing && !existing.isActive) {
      // Lifetime UNIQUE blocked by revoked row — leave as-is.
      continue;
    }

    try {
      await db.userAchievement.create({
        data: {
          userId: row.userId,
          definitionId: row.definitionId as AchievementDefinitionId,
          sourceKey: '',
          sport,
          place: definition.place ?? null,
          sourceGameId: seasonId,
          sourceEntityType: EntityType.LEAGUE_SEASON,
          sourceEntityId: seasonId,
          earnedAt,
          isActive: true,
        },
      });
      granted += 1;
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  return { planned, granted };
}
