import {
  BracketScope,
  BracketSlotKind,
  EntityType,
  LeagueParticipantType,
  PlayoffFormat,
  Prisma,
  ResultsStatus,
  RoundType,
  type Sport,
} from '@prisma/client';
import {
  getAchievementDefinition,
  groupUserIdsByPodiumPlace,
  isPodiumEligibleEntityType,
  isPodiumPlace,
  meetsPodiumParticipantFloor,
  podiumDefinitionForPlace,
  usesBracketPlacesForEventPodium,
  type PodiumPlace,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { findTeamParticipantByRoster } from '../league/leagueParticipantResolve';
import { resolveLeagueGroupStandingsMode } from '../league/leagueGroupStandingsMode';
import { clearPinsForAchievementIds } from './achievementPin.service';

export const PODIUM_UNLOCKS_KEY = 'podiumUnlocks';

export type PodiumUnlockMeta = {
  definitionId: string;
  rarity: string;
  artKey: string;
  titleKey: string;
  achievementId: string;
  place: number;
  sport: string | null;
};

export type PodiumGrantRow = {
  userId: string;
  place: PodiumPlace;
  achievementId: string;
  unlock: PodiumUnlockMeta;
};

export type PodiumGrantBatch = {
  grants: PodiumGrantRow[];
  byUserId: Map<string, PodiumUnlockMeta[]>;
  /** True when rows were revoked/recreated because standings changed. */
  replaced: boolean;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

type DesiredPodiumAward = {
  userId: string;
  place: PodiumPlace;
  definitionId: string;
};

function emptyBatch(replaced = false): PodiumGrantBatch {
  return { grants: [], byUserId: new Map(), replaced };
}

function toUnlockMeta(
  definition: ReturnType<typeof podiumDefinitionForPlace>,
  achievementId: string,
  place: PodiumPlace,
  sport: Sport | null,
): PodiumUnlockMeta {
  return {
    definitionId: definition.id,
    rarity: definition.rarity,
    artKey: definition.artKey,
    titleKey: definition.titleKey,
    achievementId,
    place,
    sport,
  };
}

export function mergePodiumUnlocksMetadata(
  existing: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  unlocks: PodiumUnlockMeta[],
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (unlocks.length > 0) {
    base[PODIUM_UNLOCKS_KEY] = unlocks;
  }
  return base as Prisma.InputJsonValue;
}

/** Remove podiumUnlocks from outcome metadata (demoted / revoked winners). */
export function stripPodiumUnlocksMetadata(
  existing: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  delete base[PODIUM_UNLOCKS_KEY];
  return base as Prisma.InputJsonValue;
}

export function readPodiumUnlocksFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): PodiumUnlockMeta[] {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }
  const raw = (metadata as Record<string, unknown>)[PODIUM_UNLOCKS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: PodiumUnlockMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.definitionId !== 'string' ||
      typeof row.rarity !== 'string' ||
      typeof row.artKey !== 'string' ||
      typeof row.titleKey !== 'string' ||
      typeof row.achievementId !== 'string' ||
      typeof row.place !== 'number'
    ) {
      continue;
    }
    out.push({
      definitionId: row.definitionId,
      rarity: row.rarity,
      artKey: row.artKey,
      titleKey: row.titleKey,
      achievementId: row.achievementId,
      place: row.place,
      sport: typeof row.sport === 'string' ? row.sport : null,
    });
  }
  return out;
}

/** Pure: compare desired awards vs active rows (userId+definitionId). */
export function podiumAwardSetEquals(
  desired: ReadonlyArray<{ userId: string; definitionId: string }>,
  existing: ReadonlyArray<{ userId: string; definitionId: string }>,
): boolean {
  if (desired.length !== existing.length) return false;
  const desiredKeys = new Set(desired.map((d) => `${d.userId}:${d.definitionId}`));
  if (desiredKeys.size !== desired.length) return false;
  for (const row of existing) {
    if (!desiredKeys.has(`${row.userId}:${row.definitionId}`)) return false;
  }
  return true;
}

async function countPlayingParticipants(db: DbClient, gameId: string): Promise<number> {
  return db.gameParticipant.count({
    where: { gameId, status: 'PLAYING' },
  });
}

const PODIUM_DEFINITION_IDS = ['podium_gold', 'podium_silver', 'podium_bronze'] as const;

/**
 * Soft-revoke active podium instances for a source event and clear their pins.
 * Frees the partial unique key so re-award can create correct rows (X1).
 */
export async function revokeActivePodiumForSource(
  db: DbClient,
  sourceKey: string,
): Promise<number> {
  const active = await db.userAchievement.findMany({
    where: {
      sourceKey,
      isActive: true,
      definitionId: { in: [...PODIUM_DEFINITION_IDS] },
    },
    select: { id: true },
  });
  if (active.length === 0) return 0;
  const ids = active.map((row) => row.id);
  await clearPinsForAchievementIds({ achievementIds: ids, tx: db });
  await db.userAchievement.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false, revokedAt: new Date() },
  });
  return ids.length;
}

/** Strip stale Results-tab celebration payloads so revoked trophies cannot re-open sheets. */
export async function clearPodiumUnlocksMetadataForGame(
  db: DbClient,
  gameId: string,
): Promise<number> {
  const outcomes = await db.gameOutcome.findMany({
    where: { gameId },
    select: { userId: true, metadata: true },
  });
  let updated = 0;
  for (const row of outcomes) {
    if (row.metadata == null || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
      continue;
    }
    const meta = { ...(row.metadata as Record<string, unknown>) };
    if (!(PODIUM_UNLOCKS_KEY in meta)) continue;
    delete meta[PODIUM_UNLOCKS_KEY];
    await db.gameOutcome.update({
      where: { gameId_userId: { gameId, userId: row.userId } },
      data: { metadata: meta as Prisma.InputJsonValue },
    });
    updated += 1;
  }
  return updated;
}

/**
 * When a podium-eligible event leaves FINAL (reopen for correction), clear its
 * active podium rows + pins so the cabinet never shows stale Legendary/Rare.
 */
export async function revokePodiumAchievementsAfterResultsReopen(params: {
  gameId: string;
  tx?: DbClient;
}): Promise<number> {
  const db = params.tx ?? prisma;
  const game = await db.game.findUnique({
    where: { id: params.gameId },
    select: { id: true, entityType: true, parentId: true },
  });
  if (!game) return 0;
  await clearPodiumUnlocksMetadataForGame(db, game.id);
  if (!isPodiumEligibleEntityType(game.entityType, game.parentId)) {
    return 0;
  }
  return revokeActivePodiumForSource(db, game.id);
}

/**
 * Any path that takes a game out of FINAL must call this (edit/reset/delete/sync/patch).
 * - Podium-eligible event: revoke instances + pins + clear outcome celebration metadata
 * - LEAGUE fixture under FINAL season: optionally rebuild standings, then re-sync season podium
 */
export async function syncPodiumAfterLeavingFinal(params: {
  gameId: string;
  tx?: DbClient;
  /** When true, rebuild parent season standings before season podium sync (if undo did not). */
  rebuildSeasonStandings?: boolean;
}): Promise<void> {
  const db = params.tx ?? prisma;
  const game = await db.game.findUnique({
    where: { id: params.gameId },
    select: { id: true, entityType: true, parentId: true },
  });
  if (!game) return;

  await clearPodiumUnlocksMetadataForGame(db, game.id);

  if (isPodiumEligibleEntityType(game.entityType, game.parentId)) {
    await revokeActivePodiumForSource(db, game.id);
    return;
  }

  if (game.entityType === EntityType.LEAGUE && game.parentId) {
    if (params.rebuildSeasonStandings) {
      const { LeagueStandingsRecalculateService } = await import(
        '../league/leagueStandingsRecalculate.service'
      );
      await LeagueStandingsRecalculateService.recalculateFromPlayedGames(
        game.parentId,
        db as Prisma.TransactionClient,
      );
    }
    await syncParentSeasonPodiumIfFinal({ gameId: game.id, tx: db });
  }
}

/**
 * After a LEAGUE fixture finalizes, re-sync the parent season podium when the
 * season itself is already FINAL (standings correction without reopening season).
 */
export async function syncParentSeasonPodiumIfFinal(params: {
  gameId: string;
  tx?: DbClient;
}): Promise<PodiumGrantBatch | null> {
  const db = params.tx ?? prisma;
  const game = await db.game.findUnique({
    where: { id: params.gameId },
    select: { entityType: true, parentId: true },
  });
  if (!game || game.entityType !== EntityType.LEAGUE || !game.parentId) {
    return null;
  }
  const parent = await db.game.findUnique({
    where: { id: game.parentId },
    select: {
      id: true,
      entityType: true,
      parentId: true,
      resultsStatus: true,
    },
  });
  if (
    !parent ||
    parent.resultsStatus !== ResultsStatus.FINAL ||
    !isPodiumEligibleEntityType(parent.entityType, parent.parentId)
  ) {
    return null;
  }
  const batch = await grantPodiumAchievementsForFinalizedGame({ gameId: parent.id, tx: db });
  await writePodiumUnlocksToGameOutcomes({ db, gameId: parent.id, batch });
  return batch;
}

async function createPodiumInstance(params: {
  db: DbClient;
  userId: string;
  place: PodiumPlace;
  sport: Sport;
  sourceEntityType: EntityType;
  sourceEntityId: string;
  sourceGameId: string;
  sourceKey: string;
}): Promise<PodiumGrantRow | null> {
  const definition = podiumDefinitionForPlace(params.place);
  if (!getAchievementDefinition(definition.id)) return null;

  try {
    const row = await params.db.userAchievement.create({
      data: {
        userId: params.userId,
        definitionId: definition.id,
        sourceKey: params.sourceKey,
        sport: params.sport,
        place: params.place,
        sourceEntityType: params.sourceEntityType,
        sourceEntityId: params.sourceEntityId,
        sourceGameId: params.sourceGameId,
        isActive: true,
      },
    });
    const unlock = toUnlockMeta(definition, row.id, params.place, params.sport);
    return {
      userId: params.userId,
      place: params.place,
      achievementId: row.id,
      unlock,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      // Concurrent finalize: reuse the active row if present.
      const existing = await params.db.userAchievement.findFirst({
        where: {
          userId: params.userId,
          definitionId: definition.id,
          sourceKey: params.sourceKey,
          isActive: true,
        },
        select: { id: true, place: true, sport: true },
      });
      if (!existing || existing.place == null || !isPodiumPlace(existing.place)) {
        return null;
      }
      const unlock = toUnlockMeta(definition, existing.id, existing.place, existing.sport);
      return {
        userId: params.userId,
        place: existing.place,
        achievementId: existing.id,
        unlock,
      };
    }
    throw error;
  }
}

function collectBatch(
  rows: Array<PodiumGrantRow | null>,
  replaced: boolean,
): PodiumGrantBatch {
  const grants = rows.filter((r): r is PodiumGrantRow => Boolean(r));
  const byUserId = new Map<string, PodiumUnlockMeta[]>();
  for (const grant of grants) {
    const list = byUserId.get(grant.userId) ?? [];
    list.push(grant.unlock);
    byUserId.set(grant.userId, list);
  }
  return { grants, byUserId, replaced };
}

function batchFromExistingRows(
  rows: Array<{
    id: string;
    userId: string;
    definitionId: string;
    place: number | null;
    sport: Sport | null;
  }>,
): PodiumGrantBatch {
  const grants: PodiumGrantRow[] = [];
  for (const row of rows) {
    if (row.place == null || !isPodiumPlace(row.place)) continue;
    const definition = getAchievementDefinition(row.definitionId);
    if (!definition || definition.ruleKind !== 'PODIUM') continue;
    const unlock = toUnlockMeta(definition, row.id, row.place, row.sport);
    grants.push({
      userId: row.userId,
      place: row.place,
      achievementId: row.id,
      unlock,
    });
  }
  return collectBatch(grants, false);
}

async function desiredFromOutcomePositions(params: {
  db: DbClient;
  gameId: string;
}): Promise<DesiredPodiumAward[]> {
  const playingCount = await countPlayingParticipants(params.db, params.gameId);
  if (!meetsPodiumParticipantFloor(playingCount)) return [];

  const [outcomes, playingParticipants] = await Promise.all([
    params.db.gameOutcome.findMany({
      where: { gameId: params.gameId },
      select: { userId: true, position: true },
    }),
    params.db.gameParticipant.findMany({
      where: { gameId: params.gameId, status: 'PLAYING' },
      select: { userId: true },
    }),
  ]);
  const playingUserIds = new Set(playingParticipants.map((p) => p.userId));
  const byPlace = groupUserIdsByPodiumPlace(
    outcomes.filter((o) => playingUserIds.has(o.userId)),
  );
  const desired: DesiredPodiumAward[] = [];
  for (const place of [1, 2, 3] as const) {
    const definition = podiumDefinitionForPlace(place);
    for (const userId of byPlace.get(place) ?? []) {
      desired.push({ userId, place, definitionId: definition.id });
    }
  }
  return desired;
}

/**
 * T2: users who appeared on a FINAL fixture roster/outcome for this participant.
 * Pure over already-loaded fixture snapshots (testable).
 */
export function eligibleUserIdsFromFinalFixtures(params: {
  participant: {
    id: string;
    participantType: 'USER' | 'TEAM' | string;
    userId: string | null;
  };
  fixtures: ReadonlyArray<{
    participantUserIds: readonly string[];
    outcomeUserIds: readonly string[];
    teams: ReadonlyArray<{ playerIds: readonly string[]; resolvedParticipantId: string | null }>;
  }>;
}): string[] {
  if (params.participant.participantType === 'USER' && params.participant.userId) {
    const uid = params.participant.userId;
    const played = params.fixtures.some(
      (f) => f.participantUserIds.includes(uid) || f.outcomeUserIds.includes(uid),
    );
    return played ? [uid] : [];
  }

  if (params.participant.participantType !== 'TEAM') return [];

  const userIds = new Set<string>();
  for (const fixture of params.fixtures) {
    for (const team of fixture.teams) {
      if (team.resolvedParticipantId !== params.participant.id) continue;
      for (const pid of team.playerIds) {
        // T2: must have actually played (PLAYING roster or outcome), not sticker-only.
        if (
          fixture.participantUserIds.includes(pid) ||
          fixture.outcomeUserIds.includes(pid)
        ) {
          userIds.add(pid);
        }
      }
    }
  }
  return [...userIds];
}

async function resolveEligibleUserIdsForParticipant(params: {
  db: DbClient;
  seasonId: string;
  participant: {
    id: string;
    participantType: LeagueParticipantType;
    userId: string | null;
  };
}): Promise<string[]> {
  const fixtures = await params.db.game.findMany({
    where: {
      parentId: params.seasonId,
      entityType: EntityType.LEAGUE,
      resultsStatus: ResultsStatus.FINAL,
    },
    select: {
      id: true,
      fixedTeams: { select: { players: { select: { userId: true } } } },
      participants: {
        where: { status: 'PLAYING' },
        select: { userId: true },
      },
      outcomes: { select: { userId: true } },
    },
  });

  const snapshots: Array<{
    participantUserIds: string[];
    outcomeUserIds: string[];
    teams: Array<{ playerIds: string[]; resolvedParticipantId: string | null }>;
  }> = [];

  for (const fixture of fixtures) {
    const teams: Array<{ playerIds: string[]; resolvedParticipantId: string | null }> = [];
    for (const team of fixture.fixedTeams) {
      const playerIds = team.players
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (playerIds.length === 0) {
        teams.push({ playerIds: [], resolvedParticipantId: null });
        continue;
      }
      const resolved = await findTeamParticipantByRoster(
        params.db as Prisma.TransactionClient,
        params.seasonId,
        playerIds,
      );
      teams.push({ playerIds, resolvedParticipantId: resolved?.id ?? null });
    }
    snapshots.push({
      participantUserIds: fixture.participants.map((p) => p.userId),
      outcomeUserIds: fixture.outcomes.map((o) => o.userId),
      teams,
    });
  }

  return eligibleUserIdsFromFinalFixtures({
    participant: params.participant,
    fixtures: snapshots,
  });
}

async function resolveParticipantIdFromFinalGame(
  db: DbClient,
  gameId: string,
  side: 'winner' | 'loser',
): Promise<string | null> {
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: {
      parentId: true,
      resultsStatus: true,
      hasFixedTeams: true,
      outcomes: { select: { userId: true, isWinner: true, position: true, wins: true } },
      fixedTeams: { select: { teamNumber: true, players: { select: { userId: true } } } },
      participants: {
        where: { status: 'PLAYING' },
        select: { userId: true },
      },
    },
  });
  if (!game || game.resultsStatus !== ResultsStatus.FINAL || !game.parentId) return null;

  if (game.fixedTeams.length > 0) {
    const teamScores = new Map<number, { wins: number; isWinner: boolean }>();
    for (const outcome of game.outcomes) {
      const team = game.fixedTeams.find((t) =>
        t.players.some((p) => p.userId === outcome.userId),
      );
      if (!team) continue;
      const prev = teamScores.get(team.teamNumber) ?? { wins: 0, isWinner: false };
      prev.wins += outcome.wins ?? 0;
      if (outcome.isWinner) prev.isWinner = true;
      teamScores.set(team.teamNumber, prev);
    }

    let winningTeamNumber: number | null = null;
    for (const [teamNumber, score] of teamScores) {
      if (score.isWinner) {
        winningTeamNumber = teamNumber;
        break;
      }
    }
    if (winningTeamNumber == null) {
      let bestWins = -1;
      for (const [teamNumber, score] of teamScores) {
        if (score.wins > bestWins) {
          bestWins = score.wins;
          winningTeamNumber = teamNumber;
        }
      }
    }

    const winningTeam = game.fixedTeams.find((t) => t.teamNumber === winningTeamNumber);
    if (!winningTeam) return null;

    const loserTeam =
      game.fixedTeams.find((t) => t.teamNumber !== winningTeamNumber) ?? null;

    const targetTeam = side === 'winner' ? winningTeam : loserTeam;
    if (!targetTeam) return null;

    const playerIds = targetTeam.players
      .map((p) => p.userId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const participant = await findTeamParticipantByRoster(
      db as Prisma.TransactionClient,
      game.parentId,
      playerIds,
    );
    return participant?.id ?? null;
  }

  // Singles / no fixed teams: map outcome winner/loser user → USER league participant.
  const ranked = [...game.outcomes].sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    const posA = a.position ?? 999;
    const posB = b.position ?? 999;
    if (posA !== posB) return posA - posB;
    return (b.wins ?? 0) - (a.wins ?? 0);
  });
  if (ranked.length === 0) return null;
  const target =
    side === 'winner' ? ranked[0] : ranked.find((o) => o.userId !== ranked[0]?.userId) ?? null;
  if (!target) return null;

  const participant = await db.leagueParticipant.findFirst({
    where: {
      leagueSeasonId: game.parentId,
      participantType: LeagueParticipantType.USER,
      userId: target.userId,
    },
    select: { id: true },
  });
  return participant?.id ?? null;
}

async function resolveBracketPodiumParticipantIds(
  db: DbClient,
  seasonId: string,
): Promise<{ hasBracket: boolean; places: Map<PodiumPlace, string[]> | null }> {
  const round = await db.leagueRound.findFirst({
    where: {
      leagueSeasonId: seasonId,
      roundType: RoundType.PLAYOFF,
      playoffFormat: PlayoffFormat.BRACKET,
    },
    orderBy: { orderIndex: 'desc' },
    select: { id: true, bracketScope: true },
  });
  if (!round) return { hasBracket: false, places: null };

  const groups =
    round.bracketScope === BracketScope.CROSS_GROUP
      ? []
      : await db.leagueGroup.findMany({
          where: { leagueSeasonId: seasonId },
          select: { id: true },
        });

  // Multi-group PER_GROUP = division trees, not one event podium → RR standings.
  if (
    !usesBracketPlacesForEventPodium(round.bracketScope, groups.length)
  ) {
    return { hasBracket: false, places: null };
  }

  const groupIds: Array<string | null> =
    round.bracketScope === BracketScope.CROSS_GROUP ? [null] : groups.map((g) => g.id);

  if (groupIds.length === 0) {
    groupIds.push(null);
  }

  const placeToParticipants = new Map<PodiumPlace, string[]>();

  for (const leagueGroupId of groupIds) {
    const slots = await db.leagueBracketSlot.findMany({
      where: { leagueRoundId: round.id, leagueGroupId },
      include: { game: { select: { id: true, resultsStatus: true } } },
    });
    if (slots.length === 0) continue;

    const grandFinalSlot = slots.find((s) => s.slotKind === BracketSlotKind.GRAND_FINAL);
    const finalSlot =
      grandFinalSlot ??
      slots.find((s) => s.slotKind === BracketSlotKind.MAIN && s.winnerSlotId == null);
    const thirdSlot = slots.find((s) => s.slotKind === BracketSlotKind.THIRD_PLACE);

    let championParticipantId: string | null = null;
    let finalistParticipantId: string | null = null;
    let thirdPlaceParticipantId: string | null = null;

    if (finalSlot?.gameId && finalSlot.game?.resultsStatus === ResultsStatus.FINAL) {
      championParticipantId = await resolveParticipantIdFromFinalGame(db, finalSlot.gameId, 'winner');
      finalistParticipantId = await resolveParticipantIdFromFinalGame(db, finalSlot.gameId, 'loser');
    }
    if (thirdSlot?.gameId && thirdSlot.game?.resultsStatus === ResultsStatus.FINAL) {
      thirdPlaceParticipantId = await resolveParticipantIdFromFinalGame(
        db,
        thirdSlot.gameId,
        'winner',
      );
    }

    if (!championParticipantId) continue;

    const push = (place: PodiumPlace, id: string | null) => {
      if (!id) return;
      const list = placeToParticipants.get(place) ?? [];
      if (!list.includes(id)) list.push(id);
      placeToParticipants.set(place, list);
    };
    push(1, championParticipantId);
    push(2, finalistParticipantId);
    push(3, thirdPlaceParticipantId);
  }

  return {
    hasBracket: true,
    places: placeToParticipants.size > 0 ? placeToParticipants : null,
  };
}

async function resolveStandingsPodiumParticipantIds(
  db: DbClient,
  seasonId: string,
): Promise<Map<PodiumPlace, string[]>> {
  const season = await db.leagueSeason.findUnique({
    where: { id: seasonId },
    select: {
      game: { select: { hasFixedTeams: true, playersPerMatch: true } },
    },
  });
  const hasFixedTeams = season?.game?.hasFixedTeams ?? false;
  const standingsMode = resolveLeagueGroupStandingsMode(season?.game ?? {});

  const participants = await db.leagueParticipant.findMany({
    where: {
      leagueSeasonId: seasonId,
      participantType: hasFixedTeams ? LeagueParticipantType.TEAM : LeagueParticipantType.USER,
    },
    select: {
      id: true,
      wins: true,
      points: true,
      scoreDelta: true,
      currentGroupId: true,
      userId: true,
      leagueTeamId: true,
      leagueTeam: {
        select: { players: { select: { userId: true } } },
      },
    },
    orderBy: [{ wins: 'desc' }, { points: 'desc' }, { scoreDelta: 'desc' }, { id: 'asc' }],
  });

  let ordered = participants.map((p) => ({
    ...p,
    currentGroupId: p.currentGroupId ?? null,
  }));

  if (standingsMode && ordered.length > 1) {
    const { applyGroupStandingsTiebreakers } = await import(
      '../league/leagueGroupStandingsFixtures'
    );
    ordered = await applyGroupStandingsTiebreakers(
      db as Prisma.TransactionClient,
      seasonId,
      ordered,
      standingsMode,
    );
    // Wins → H2H already applied. Event-wide: order by wins only; keep H2H
    // relative order among equal-wins (do not re-rank by points/Δ).
    ordered = [...ordered].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return 0;
    });

    const map = new Map<PodiumPlace, string[]>();
    for (let idx = 0; idx < Math.min(3, ordered.length); idx += 1) {
      const place = (idx + 1) as PodiumPlace;
      if (!isPodiumPlace(place)) continue;
      map.set(place, [ordered[idx].id]);
    }
    return map;
  }

  // Non-H2H modes (e.g. rotating pairs): points / scoreDelta matter.
  ordered = [...ordered].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.points !== a.points) return b.points - a.points;
    if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
    return 0;
  });

  const map = new Map<PodiumPlace, string[]>();
  let place = 1;
  let i = 0;
  while (i < ordered.length && place <= 3) {
    const row = ordered[i];
    const tiedIds: string[] = [row.id];
    let j = i + 1;
    while (
      j < ordered.length &&
      ordered[j].wins === row.wins &&
      ordered[j].points === row.points &&
      ordered[j].scoreDelta === row.scoreDelta
    ) {
      tiedIds.push(ordered[j].id);
      j += 1;
    }
    if (isPodiumPlace(place)) {
      map.set(place, tiedIds);
    }
    place += 1;
    i = j;
  }
  return map;
}

async function desiredFromLeagueSeason(params: {
  db: DbClient;
  seasonId: string;
}): Promise<DesiredPodiumAward[]> {
  const playingCount = await countPlayingParticipants(params.db, params.seasonId);
  if (!meetsPodiumParticipantFloor(playingCount)) return [];

  const bracket = await resolveBracketPodiumParticipantIds(params.db, params.seasonId);
  // Bracket season with incomplete finals must not fall back to RR standings podium.
  if (bracket.hasBracket && !bracket.places) {
    return [];
  }
  const placeToParticipantIds =
    bracket.places ?? (await resolveStandingsPodiumParticipantIds(params.db, params.seasonId));

  const allParticipantIds = [...placeToParticipantIds.values()].flat();
  const participants = await params.db.leagueParticipant.findMany({
    where: { id: { in: allParticipantIds } },
    select: { id: true, participantType: true, userId: true },
  });
  const byId = new Map(participants.map((p) => [p.id, p]));

  const desired: DesiredPodiumAward[] = [];
  for (const place of [1, 2, 3] as const) {
    const definition = podiumDefinitionForPlace(place);
    const participantIds = placeToParticipantIds.get(place) ?? [];
    for (const participantId of participantIds) {
      const participant = byId.get(participantId);
      if (!participant) continue;
      const userIds = await resolveEligibleUserIdsForParticipant({
        db: params.db,
        seasonId: params.seasonId,
        participant,
      });
      for (const userId of userIds) {
        desired.push({ userId, place, definitionId: definition.id });
      }
    }
  }
  return desired;
}

async function materializeDesiredAwards(params: {
  db: DbClient;
  desired: DesiredPodiumAward[];
  sport: Sport;
  sourceEntityType: EntityType;
  sourceEntityId: string;
  sourceGameId: string;
  sourceKey: string;
  replaced: boolean;
}): Promise<PodiumGrantBatch> {
  const created: Array<PodiumGrantRow | null> = [];
  for (const award of params.desired) {
    created.push(
      await createPodiumInstance({
        db: params.db,
        userId: award.userId,
        place: award.place,
        sport: params.sport,
        sourceEntityType: params.sourceEntityType,
        sourceEntityId: params.sourceEntityId,
        sourceGameId: params.sourceGameId,
        sourceKey: params.sourceKey,
      }),
    );
  }
  return collectBatch(created, params.replaced);
}

export async function writePodiumUnlocksToGameOutcomes(params: {
  db: DbClient;
  gameId: string;
  batch: PodiumGrantBatch;
}): Promise<void> {
  if (params.batch.replaced) {
    const outcomes = await params.db.gameOutcome.findMany({
      where: { gameId: params.gameId },
      select: { userId: true, metadata: true },
    });
    for (const row of outcomes) {
      const unlocks = params.batch.byUserId.get(row.userId);
      await params.db.gameOutcome.update({
        where: { gameId_userId: { gameId: params.gameId, userId: row.userId } },
        data: {
          metadata: unlocks?.length
            ? mergePodiumUnlocksMetadata(row.metadata, unlocks)
            : stripPodiumUnlocksMetadata(row.metadata),
        },
      });
    }
    return;
  }

  if (params.batch.grants.length === 0) return;

  for (const [userId, unlocks] of params.batch.byUserId) {
    const gameOutcome = await params.db.gameOutcome.findUnique({
      where: { gameId_userId: { gameId: params.gameId, userId } },
      select: { metadata: true },
    });
    if (!gameOutcome) continue;
    await params.db.gameOutcome.update({
      where: { gameId_userId: { gameId: params.gameId, userId } },
      data: {
        metadata: mergePodiumUnlocksMetadata(gameOutcome.metadata, unlocks),
      },
    });
  }
}

/**
 * Sync stacked gold/silver/bronze when a podium-eligible event is FINAL.
 * Idempotent when awards unchanged (keeps pins). Revokes+re-awards only when the
 * winner set changes (X1 corrections).
 */
export async function grantPodiumAchievementsForFinalizedGame(params: {
  gameId: string;
  tx?: DbClient;
}): Promise<PodiumGrantBatch> {
  const db = params.tx ?? prisma;
  const game = await db.game.findUnique({
    where: { id: params.gameId },
    select: {
      id: true,
      entityType: true,
      parentId: true,
      sport: true,
      resultsStatus: true,
    },
  });

  if (!game || game.resultsStatus !== ResultsStatus.FINAL) {
    return emptyBatch();
  }
  if (!isPodiumEligibleEntityType(game.entityType, game.parentId)) {
    return emptyBatch();
  }

  const desiredRaw =
    game.entityType === EntityType.LEAGUE_SEASON
      ? await desiredFromLeagueSeason({ db, seasonId: game.id })
      : await desiredFromOutcomePositions({ db, gameId: game.id });

  // Guard against duplicate (userId, definitionId) thrashing sync equality.
  const desired: DesiredPodiumAward[] = [];
  const seenDesired = new Set<string>();
  for (const row of desiredRaw) {
    const key = `${row.userId}:${row.definitionId}`;
    if (seenDesired.has(key)) continue;
    seenDesired.add(key);
    desired.push(row);
  }

  const existing = await db.userAchievement.findMany({
    where: {
      sourceKey: game.id,
      isActive: true,
      definitionId: { in: [...PODIUM_DEFINITION_IDS] },
    },
    select: {
      id: true,
      userId: true,
      definitionId: true,
      place: true,
      sport: true,
    },
  });

  if (desired.length === 0) {
    if (existing.length > 0) {
      await revokeActivePodiumForSource(db, game.id);
      await clearPodiumUnlocksMetadataForGame(db, game.id);
      return emptyBatch(true);
    }
    return emptyBatch(false);
  }

  if (podiumAwardSetEquals(desired, existing)) {
    return batchFromExistingRows(existing);
  }

  await revokeActivePodiumForSource(db, game.id);
  await clearPodiumUnlocksMetadataForGame(db, game.id);

  return materializeDesiredAwards({
    db,
    desired,
    sport: game.sport,
    sourceEntityType: game.entityType,
    sourceEntityId: game.id,
    sourceGameId: game.id,
    sourceKey: game.id,
    replaced: existing.length > 0,
  });
}
