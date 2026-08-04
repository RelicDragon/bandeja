import type { Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  SHOWCASE_SLOT_COUNT,
  getAchievementDefinition,
  projectTrophyCabinet,
  resolveTrophyShowcase,
  type AchievementType,
  type AchievementDefinitionId,
  type AchievementInstanceInput,
  type HabitProgressCounters,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { purgeOrphanPinsForUser } from './achievementPin.service';
import { loadOrganizeHabitCounters } from './organizeGrant.service';
import { loadPartnerHabitCounters } from './partnerGrant.service';

export type TrophyDefinitionView = {
  id: string;
  type: AchievementType;
  rarity: string;
  artKey: string;
  ruleKind: string;
  titleKey: string;
  descriptionKey: string;
  place?: number;
  threshold?: number;
};

export type TrophyInstanceView = {
  id: string;
  definitionId: string;
  earnedAt: string;
  sport: Sport | null;
  place: number | null;
  source: {
    entityType: string;
    entityId: string;
    gameId: string | null;
    title: string | null;
  } | null;
};

export type TrophyCabinetEntryView = {
  definition: TrophyDefinitionView;
  unlocked: boolean;
  instances: TrophyInstanceView[];
  progress: { current: number; target: number } | null;
};

export type TrophyShowcaseSlotView = {
  slot: number;
  pinned: boolean;
  definition: TrophyDefinitionView | null;
  instance: TrophyInstanceView | null;
  instances: TrophyInstanceView[];
};

export type TrophyPendingCelebration = {
  definitionId: string;
  rarity: string;
  artKey: string;
  titleKey: string;
  achievementId: string;
  place: number | null;
  sport: string | null;
  earnedAt: string;
};

export type TrophiesPayload = {
  showcase: TrophyShowcaseSlotView[];
  cabinet: TrophyCabinetEntryView[];
  pinsEditable: boolean;
  /** True pin slot instance ids (not auto-filled showcase). */
  pinnedInstanceIds: string[];
  /** Distinct unlocked catalog definitions (not stacked instance count). */
  unlockedCount: number;
  /** Owner-only: recent Rare/Legendary unlocks awaiting in-app celebration. */
  pendingCelebrations: TrophyPendingCelebration[];
};

type SportProfileCounterFields = {
  sport?: string | null;
  gamesPlayed?: number | null;
  gamesWon?: number | null;
  playStreakBest?: number | null;
  playStreakCount?: number | null;
};

function toDefinitionView(
  def: NonNullable<ReturnType<typeof getAchievementDefinition>>,
): TrophyDefinitionView {
  return {
    id: def.id,
    type: def.type,
    rarity: def.rarity,
    artKey: def.artKey,
    ruleKind: def.ruleKind,
    titleKey: def.titleKey,
    descriptionKey: def.descriptionKey,
    ...(def.place != null ? { place: def.place } : {}),
    ...(def.threshold != null ? { threshold: def.threshold } : {}),
  };
}

function toInstanceView(row: {
  id: string;
  definitionId: string;
  earnedAt: Date;
  sport: Sport | null;
  place: number | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  sourceGameId: string | null;
}): TrophyInstanceView {
  const source =
    row.sourceEntityType && row.sourceEntityId
      ? {
          entityType: row.sourceEntityType,
          entityId: row.sourceEntityId,
          gameId: row.sourceGameId,
          title: null as string | null,
        }
      : null;
  return {
    id: row.id,
    definitionId: row.definitionId,
    earnedAt: row.earnedAt.toISOString(),
    sport: row.sport,
    place: row.place,
    source,
  };
}

export function emptyTrophiesPayload(isOwner: boolean): TrophiesPayload {
  const cabinet = projectTrophyCabinet({
    isOwner,
    instances: [],
    counters: { streakBest: 0, gamesFinished: 0, gamesWon: 0, gamesFinishedBySport: {} },
  }).map((row) => ({
    definition: toDefinitionView(row.definition),
    unlocked: row.unlocked,
    instances: [] as TrophyInstanceView[],
    progress: row.progress,
  }));
  return {
    showcase: resolveTrophyShowcase({ instances: [], pins: [] }).map((s) => ({
      slot: s.slot,
      pinned: false,
      definition: null,
      instance: null,
      instances: [],
    })),
    cabinet,
    pinsEditable: isOwner,
    pinnedInstanceIds: [],
    unlockedCount: 0,
    pendingCelebrations: [],
  };
}

export function countersFromSportProfiles(
  profiles: SportProfileCounterFields[],
): HabitProgressCounters {
  let gamesFinished = 0;
  let gamesWon = 0;
  let streakBest = 0;
  const gamesFinishedBySport: Record<string, number> = {};
  for (const p of profiles) {
    const played = p.gamesPlayed ?? 0;
    gamesFinished += played;
    gamesWon += p.gamesWon ?? 0;
    // Current streak count only — not lifetime best (forward-only + chase progress).
    streakBest = Math.max(streakBest, p.playStreakCount ?? 0);
    if (p.sport && played > 0) {
      gamesFinishedBySport[p.sport] = (gamesFinishedBySport[p.sport] ?? 0) + played;
    }
  }
  return { streakBest, gamesFinished, gamesWon, gamesFinishedBySport };
}

function distinctUnlockedDefinitionCount(
  rows: Array<{ definitionId: string }>,
): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (getAchievementDefinition(row.definitionId)) ids.add(row.definitionId);
  }
  return ids.size;
}

export async function buildTrophiesPayload(params: {
  userId: string;
  viewerUserId: string | null | undefined;
  counters: HabitProgressCounters;
}): Promise<TrophiesPayload> {
  const isOwner = Boolean(params.viewerUserId && params.viewerUserId === params.userId);
  const organize = await loadOrganizeHabitCounters(params.userId);
  const partner = await loadPartnerHabitCounters(params.userId);
  const counters: HabitProgressCounters = { ...params.counters, ...organize, ...partner };

  await purgeOrphanPinsForUser({ userId: params.userId });

  const [rows, pins] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId: params.userId, isActive: true },
      orderBy: { earnedAt: 'desc' },
    }),
    prisma.userAchievementPin.findMany({
      where: {
        userId: params.userId,
        slot: { gte: 0, lte: SHOWCASE_SLOT_COUNT - 1 },
      },
      orderBy: { slot: 'asc' },
    }),
  ]);

  const knownRows = rows.filter((r) => getAchievementDefinition(r.definitionId));

  const sourceGameIds = [
    ...new Set(
      knownRows
        .map((r) => r.sourceGameId ?? r.sourceEntityId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const sourceGames =
    sourceGameIds.length > 0
      ? await prisma.game.findMany({
          where: { id: { in: sourceGameIds } },
          select: {
            id: true,
            name: true,
            leagueSeason: { select: { league: { select: { name: true } } } },
          },
        })
      : [];
  const titleByGameId = new Map(
    sourceGames.map((g) => [
      g.id,
      g.name?.trim() || g.leagueSeason?.league?.name?.trim() || null,
    ] as const),
  );

  const instanceInputs: AchievementInstanceInput[] = knownRows.map((r) => ({
    id: r.id,
    definitionId: r.definitionId as AchievementDefinitionId,
    earnedAt: r.earnedAt.toISOString(),
    sport: r.sport,
    place: r.place,
    sourceEntityType: r.sourceEntityType,
    sourceEntityId: r.sourceEntityId,
    sourceGameId: r.sourceGameId,
    sourceTitle: titleByGameId.get(r.sourceGameId ?? r.sourceEntityId ?? '') ?? null,
  }));

  const instanceViewsById = new Map(
    knownRows.map((r) => {
      const view = toInstanceView(r);
      const title =
        titleByGameId.get(r.sourceGameId ?? r.sourceEntityId ?? '') ?? null;
      if (view.source && title) {
        view.source = { ...view.source, title };
      }
      return [r.id, view] as const;
    }),
  );

  const showcaseResolved = resolveTrophyShowcase({
    instances: instanceInputs,
    pins: pins.map((p) => ({ slot: p.slot, achievementId: p.achievementId })),
  });

  const showcase: TrophyShowcaseSlotView[] = showcaseResolved.map((s) => {
    const instance = s.instance ? instanceViewsById.get(s.instance.id) ?? null : null;
    const instances = s.instances
      ? s.instances
          .map((inst) => instanceViewsById.get(inst.id))
          .filter((v): v is TrophyInstanceView => Boolean(v))
      : instance
      ? [instance]
      : [];
    const def = s.definitionId ? getAchievementDefinition(s.definitionId) : undefined;
    return {
      slot: s.slot,
      pinned: s.pinned,
      definition: def ? toDefinitionView(def) : null,
      instance,
      instances,
    };
  });

  const cabinet = projectTrophyCabinet({
    isOwner,
    instances: instanceInputs,
    counters,
  }).map((row) => ({
    definition: toDefinitionView(row.definition),
    unlocked: row.unlocked,
    instances: row.instances
      .map((i) => instanceViewsById.get(i.id))
      .filter((v): v is TrophyInstanceView => Boolean(v)),
    progress: row.progress,
  }));

  const pendingCelebrations: TrophyPendingCelebration[] = [];
  if (isOwner) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const row of knownRows) {
      const def = getAchievementDefinition(row.definitionId);
      if (!def) continue;
      if (def.rarity !== 'RARE' && def.rarity !== 'LEGENDARY' && def.rarity !== 'UNIQUE') continue;
      if (row.earnedAt.getTime() < cutoff) continue;
      pendingCelebrations.push({
        definitionId: def.id,
        rarity: def.rarity,
        artKey: def.artKey,
        titleKey: def.titleKey,
        achievementId: row.id,
        place: row.place,
        sport: row.sport,
        earnedAt: row.earnedAt.toISOString(),
      });
      if (pendingCelebrations.length >= 5) break;
    }
  }

  const knownIds = new Set(knownRows.map((r) => r.id));

  return {
    showcase,
    cabinet,
    pinsEditable: isOwner,
    pinnedInstanceIds: pins
      .filter((p) => knownIds.has(p.achievementId))
      .map((p) => p.achievementId),
    unlockedCount: distinctUnlockedDefinitionCount(knownRows),
    pendingCelebrations,
  };
}

/** Attach trophies onto a user-shaped object (profile / stats). */
export async function attachTrophiesToUser<
  T extends { id: string; sportProfiles?: SportProfileCounterFields[] | null },
>(user: T, viewerUserId: string | null | undefined): Promise<T & { trophies: TrophiesPayload }> {
  const trophies = await buildTrophiesPayload({
    userId: user.id,
    viewerUserId,
    counters: countersFromSportProfiles(user.sportProfiles ?? []),
  });
  return { ...user, trophies };
}

/** Catalog length helper for tests. */
export function catalogDefinitionCount(): number {
  return ACHIEVEMENT_CATALOG.length;
}
