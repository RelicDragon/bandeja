import { EntityType, ParticipantRole, type Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  isLifetimeAchievement,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import {
  achievementPlayAt,
  compareByAchievementPlayAt,
} from './achievementPlayAt';
import type { HabitCrossing } from './habitCrossingDates';

type DbClient = typeof prisma;

export type OrganizeCrossingGameRow = {
  id: string;
  entityType: string;
  finishedDate: Date | null;
  endTime: Date | null;
  startTime: Date | null;
  createdAt: Date;
};

function sortByThreshold(defs: AchievementDefinition[]): AchievementDefinition[] {
  return [...defs].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
}

function organizeDefs(
  ruleKind: 'HABIT_ORGANIZE_GAME' | 'HABIT_ORGANIZE_TOURNAMENT' | 'HABIT_ORGANIZE_BAR',
): AchievementDefinition[] {
  return sortByThreshold(
    ACHIEVEMENT_CATALOG.filter(
      (d) => isLifetimeAchievement(d) && d.ruleKind === ruleKind && d.threshold != null,
    ),
  );
}

/**
 * Replay OWNER FINAL events in playAt order; record first crossing of each
 * organize threshold. Must sort by playAt (not finishedDate column) — games with
 * null finishedDate use endTime/startTime and would invert ladder dates if ordered
 * by finishedDate ASC (nulls last).
 */
export function replayOrganizeCrossingDates(params: {
  rows: ReadonlyArray<OrganizeCrossingGameRow>;
  definitionIds: ReadonlySet<string>;
}): Map<string, HabitCrossing> {
  const out = new Map<string, HabitCrossing>();
  const wanted = params.definitionIds;
  if (wanted.size === 0) return out;

  const pendingGame = organizeDefs('HABIT_ORGANIZE_GAME').filter((d) => wanted.has(d.id));
  const pendingTournament = organizeDefs('HABIT_ORGANIZE_TOURNAMENT').filter((d) =>
    wanted.has(d.id),
  );
  const pendingBar = organizeDefs('HABIT_ORGANIZE_BAR').filter((d) => wanted.has(d.id));
  if (pendingGame.length === 0 && pendingTournament.length === 0 && pendingBar.length === 0) {
    return out;
  }

  const rows = [...params.rows].sort(compareByAchievementPlayAt);

  let games = 0;
  let tournaments = 0;
  let bars = 0;

  for (const row of rows) {
    const at = achievementPlayAt(row);
    if (row.entityType === EntityType.GAME || row.entityType === 'GAME') {
      games += 1;
      while (
        pendingGame.length > 0 &&
        games >= (pendingGame[0]!.threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingGame.shift()!;
        out.set(def.id, { definitionId: def.id, earnedAt: at, sourceGameId: row.id });
      }
    } else if (row.entityType === EntityType.TOURNAMENT || row.entityType === 'TOURNAMENT') {
      tournaments += 1;
      while (
        pendingTournament.length > 0 &&
        tournaments >= (pendingTournament[0]!.threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingTournament.shift()!;
        out.set(def.id, { definitionId: def.id, earnedAt: at, sourceGameId: row.id });
      }
    } else if (row.entityType === EntityType.BAR || row.entityType === 'BAR') {
      bars += 1;
      while (
        pendingBar.length > 0 &&
        bars >= (pendingBar[0]!.threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingBar.shift()!;
        out.set(def.id, { definitionId: def.id, earnedAt: at, sourceGameId: row.id });
      }
    }
  }

  return out;
}

/**
 * Replay OWNER FINAL events chronologically; record first crossing of each
 * organize threshold (GAME / TOURNAMENT / BAR).
 */
export async function computeOrganizeCrossingDates(params: {
  userId: string;
  definitionIds: ReadonlySet<string>;
  tx?: DbClient;
}): Promise<Map<string, HabitCrossing>> {
  const wanted = params.definitionIds;
  if (wanted.size === 0) return new Map();

  const needsGame = organizeDefs('HABIT_ORGANIZE_GAME').some((d) => wanted.has(d.id));
  const needsTournament = organizeDefs('HABIT_ORGANIZE_TOURNAMENT').some((d) =>
    wanted.has(d.id),
  );
  const needsBar = organizeDefs('HABIT_ORGANIZE_BAR').some((d) => wanted.has(d.id));
  if (!needsGame && !needsTournament && !needsBar) return new Map();

  const db = params.tx ?? prisma;
  const rows = await db.game.findMany({
    where: {
      resultsStatus: 'FINAL',
      participants: {
        some: { userId: params.userId, role: ParticipantRole.OWNER },
      },
      OR: [
        {
          entityType: EntityType.GAME,
          sport: 'PADEL' as Sport,
          affectsRating: true,
          outcomes: { some: {} },
        },
        {
          entityType: EntityType.TOURNAMENT,
          sport: 'PADEL' as Sport,
          affectsRating: true,
          outcomes: { some: {} },
        },
        { entityType: EntityType.BAR },
      ],
    },
    select: {
      id: true,
      entityType: true,
      finishedDate: true,
      endTime: true,
      startTime: true,
      createdAt: true,
    },
  });

  return replayOrganizeCrossingDates({ rows, definitionIds: wanted });
}
