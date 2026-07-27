import { EntityType, ParticipantRole, type Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import type { HabitCrossing } from './habitCrossingDates';

type DbClient = typeof prisma;

function playAt(game: {
  finishedDate: Date | null;
  endTime: Date | null;
  startTime: Date | null;
  createdAt: Date;
}): Date {
  return game.finishedDate ?? game.endTime ?? game.startTime ?? game.createdAt;
}

function sortByThreshold(defs: AchievementDefinition[]): AchievementDefinition[] {
  return [...defs].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
}

function organizeDefs(
  ruleKind: 'HABIT_ORGANIZE_GAME' | 'HABIT_ORGANIZE_TOURNAMENT' | 'HABIT_ORGANIZE_BAR',
): AchievementDefinition[] {
  return sortByThreshold(
    ACHIEVEMENT_CATALOG.filter(
      (d) => d.multiplicity === 'one_shot' && d.ruleKind === ruleKind && d.threshold != null,
    ),
  );
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
    orderBy: [{ finishedDate: 'asc' }, { endTime: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      entityType: true,
      finishedDate: true,
      endTime: true,
      startTime: true,
      createdAt: true,
    },
  });

  let games = 0;
  let tournaments = 0;
  let bars = 0;

  for (const row of rows) {
    const at = playAt(row);
    if (row.entityType === EntityType.GAME) {
      games += 1;
      while (
        pendingGame.length > 0 &&
        games >= (pendingGame[0]!.threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingGame.shift()!;
        out.set(def.id, { definitionId: def.id, earnedAt: at, sourceGameId: row.id });
      }
    } else if (row.entityType === EntityType.TOURNAMENT) {
      tournaments += 1;
      while (
        pendingTournament.length > 0 &&
        tournaments >= (pendingTournament[0]!.threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingTournament.shift()!;
        out.set(def.id, { definitionId: def.id, earnedAt: at, sourceGameId: row.id });
      }
    } else if (row.entityType === EntityType.BAR) {
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
