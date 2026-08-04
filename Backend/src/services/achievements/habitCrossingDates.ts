import type { Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  isLifetimeAchievement,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import {
  advancePlayStreak,
  isPlayStreakAlive,
  type PlayStreakState,
} from '../results/playStreak';

export type HabitCrossingEvent = {
  gameId: string;
  sport: Sport;
  at: Date;
  gamesPlayedDelta: number;
  gamesWonDelta: number;
  /** Same filter as play-streak qualifying plays. */
  qualifiesForStreak: boolean;
};

export type HabitCrossing = {
  definitionId: string;
  earnedAt: Date;
  sourceGameId: string;
};

const emptyStreak = (): PlayStreakState => ({
  count: 0,
  best: 0,
  lastPlayAt: null,
  weekStartAt: null,
});

function maxAliveStreak(
  bySport: Map<Sport, PlayStreakState>,
  timezone: string,
  at: Date,
): number {
  let max = 0;
  for (const state of bySport.values()) {
    if (state.lastPlayAt && isPlayStreakAlive(state.lastPlayAt, timezone, at)) {
      max = Math.max(max, state.count);
    }
  }
  return max;
}

function sortByThreshold(defs: AchievementDefinition[]): AchievementDefinition[] {
  return [...defs].sort((a, b) => (a.threshold ?? 0) - (b.threshold ?? 0));
}

function habitDefsByRule(): {
  volume: AchievementDefinition[];
  wins: AchievementDefinition[];
  streak: AchievementDefinition[];
  /** Sport code → sport-scoped volume habits. */
  sportVolume: Map<string, AchievementDefinition[]>;
} {
  const volume: AchievementDefinition[] = [];
  const wins: AchievementDefinition[] = [];
  const streak: AchievementDefinition[] = [];
  const sportVolume = new Map<string, AchievementDefinition[]>();
  for (const def of ACHIEVEMENT_CATALOG) {
    if (!isLifetimeAchievement(def) || def.threshold == null) continue;
    if (def.ruleKind === 'HABIT_VOLUME') volume.push(def);
    else if (def.ruleKind === 'HABIT_FIRST_WIN' || def.ruleKind === 'HABIT_WINS') {
      wins.push(def);
    } else if (def.ruleKind === 'HABIT_STREAK') streak.push(def);
    else if (def.ruleKind === 'HABIT_SPORT_VOLUME' && def.sport) {
      const list = sportVolume.get(def.sport) ?? [];
      list.push(def);
      sportVolume.set(def.sport, list);
    }
  }
  for (const [sport, list] of sportVolume) {
    sportVolume.set(sport, sortByThreshold(list));
  }
  return {
    volume: sortByThreshold(volume),
    wins: sortByThreshold(wins),
    streak: sortByThreshold(streak),
    sportVolume,
  };
}

/**
 * Replay outcome timeline and record the first instant each lifetime habit
 * threshold was crossed (volume / wins / streak).
 */
export function computeHabitCrossingDates(params: {
  events: ReadonlyArray<HabitCrossingEvent>;
  timezone: string;
  /** Only return crossings for these definition ids (e.g. already granted). */
  definitionIds: ReadonlySet<string>;
}): Map<string, HabitCrossing> {
  const wanted = params.definitionIds;
  const out = new Map<string, HabitCrossing>();
  if (wanted.size === 0) return out;

  const { volume, wins, streak, sportVolume } = habitDefsByRule();
  const pendingVolume = volume.filter((d) => wanted.has(d.id));
  const pendingWins = wins.filter((d) => wanted.has(d.id));
  const pendingStreak = streak.filter((d) => wanted.has(d.id));
  const pendingSportVolume = new Map<string, AchievementDefinition[]>();
  let pendingSportVolumeCount = 0;
  for (const [sport, defs] of sportVolume) {
    const pending = defs.filter((d) => wanted.has(d.id));
    if (pending.length === 0) continue;
    pendingSportVolume.set(sport, pending);
    pendingSportVolumeCount += pending.length;
  }

  const sorted = [...params.events].sort((a, b) => {
    const t = a.at.getTime() - b.at.getTime();
    if (t !== 0) return t;
    return a.gameId.localeCompare(b.gameId);
  });

  let gamesFinished = 0;
  let gamesWon = 0;
  const gamesFinishedBySport = new Map<string, number>();
  const streakBySport = new Map<Sport, PlayStreakState>();

  for (const event of sorted) {
    if (
      pendingVolume.length === 0 &&
      pendingWins.length === 0 &&
      pendingStreak.length === 0 &&
      pendingSportVolumeCount === 0
    ) {
      break;
    }

    if (event.gamesPlayedDelta > 0) {
      gamesFinished += event.gamesPlayedDelta;
      while (
        pendingVolume.length > 0 &&
        gamesFinished >= (pendingVolume[0].threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingVolume.shift()!;
        out.set(def.id, {
          definitionId: def.id,
          earnedAt: event.at,
          sourceGameId: event.gameId,
        });
      }

      const sportKey = event.sport;
      const sportCount =
        (gamesFinishedBySport.get(sportKey) ?? 0) + event.gamesPlayedDelta;
      gamesFinishedBySport.set(sportKey, sportCount);
      const pendingForSport = pendingSportVolume.get(sportKey);
      while (
        pendingForSport &&
        pendingForSport.length > 0 &&
        sportCount >= (pendingForSport[0].threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingForSport.shift()!;
        pendingSportVolumeCount -= 1;
        out.set(def.id, {
          definitionId: def.id,
          earnedAt: event.at,
          sourceGameId: event.gameId,
        });
      }
    }

    if (event.gamesWonDelta > 0) {
      gamesWon += event.gamesWonDelta;
      while (
        pendingWins.length > 0 &&
        gamesWon >= (pendingWins[0].threshold ?? Number.POSITIVE_INFINITY)
      ) {
        const def = pendingWins.shift()!;
        out.set(def.id, {
          definitionId: def.id,
          earnedAt: event.at,
          sourceGameId: event.gameId,
        });
      }
    }

    if (event.qualifiesForStreak && event.gamesPlayedDelta > 0) {
      const prev = streakBySport.get(event.sport) ?? emptyStreak();
      const next = advancePlayStreak(prev, event.at, params.timezone);
      streakBySport.set(event.sport, {
        count: next.count,
        best: next.best,
        lastPlayAt: next.lastPlayAt,
        weekStartAt: next.weekStartAt,
      });
      if (next.advanced) {
        const maxCount = maxAliveStreak(streakBySport, params.timezone, event.at);
        while (
          pendingStreak.length > 0 &&
          maxCount >= (pendingStreak[0].threshold ?? Number.POSITIVE_INFINITY)
        ) {
          const def = pendingStreak.shift()!;
          out.set(def.id, {
            definitionId: def.id,
            earnedAt: event.at,
            sourceGameId: event.gameId,
          });
        }
      }
    }
  }

  return out;
}
