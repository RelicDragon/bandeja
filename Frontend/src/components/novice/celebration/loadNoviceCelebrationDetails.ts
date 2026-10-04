import { gamesApi } from '@/api/games';
import { wasCelebrationShown } from '@/components/trophies/trophyCelebrationGate';
import type { Game } from '@/types';
import type { TrophyPendingCelebration, TrophyRarity } from '@/types/trophies';
import type {
  NoviceCelebrationAchievement,
  NoviceCelebrationResult,
} from './noviceCelebrationPlan';

export type NoviceCelebrationDetails = {
  result: NoviceCelebrationResult | null;
  achievements: NoviceCelebrationAchievement[];
};

/** Details are a nicety: never hold the celebration longer than this. */
export const DETAILS_TIMEOUT_MS = 2500;

/** An older result than this is not "the game you just played". */
const RECENT_RESULT_MS = 14 * 24 * 60 * 60 * 1000;

const RARITIES: ReadonlySet<string> = new Set<TrophyRarity>(['COMMON', 'RARE', 'LEGENDARY', 'UNIQUE']);

function isRarity(value: unknown): value is TrophyRarity {
  return typeof value === 'string' && RARITIES.has(value);
}

const EMPTY: NoviceCelebrationDetails = { result: null, achievements: [] };

type HabitUnlockRow = {
  definitionId?: unknown;
  rarity?: unknown;
  artKey?: unknown;
  titleKey?: unknown;
  achievementId?: unknown;
};

function readHabitUnlocks(raw: unknown): NoviceCelebrationAchievement[] {
  if (!Array.isArray(raw)) return [];
  const out: NoviceCelebrationAchievement[] = [];
  for (const item of raw as HabitUnlockRow[]) {
    if (!item || typeof item !== 'object') continue;
    if (
      typeof item.definitionId !== 'string' ||
      typeof item.titleKey !== 'string' ||
      typeof item.artKey !== 'string' ||
      !isRarity(item.rarity)
    ) {
      continue;
    }
    out.push({
      definitionId: item.definitionId,
      titleKey: item.titleKey,
      artKey: item.artKey,
      rarity: item.rarity,
      ...(typeof item.achievementId === 'string' ? { achievementId: item.achievementId } : {}),
    });
  }
  return out;
}

/** Newest recent game with an own outcome → result + its habit unlocks. */
export function pickLatestOwnOutcome(
  games: Game[],
  userId: string,
  now = Date.now(),
): { result: NoviceCelebrationResult; unlocks: NoviceCelebrationAchievement[] } | null {
  const sorted = [...games].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );
  for (const game of sorted) {
    const started = new Date(game.startTime).getTime();
    if (!Number.isFinite(started) || now - started > RECENT_RESULT_MS) continue;
    const own = game.outcomes?.find((o) => o.userId === userId);
    if (!own) continue;
    return {
      result: {
        gameId: game.id,
        levelBefore: own.levelBefore,
        levelAfter: own.levelAfter,
        wins: own.wins,
        ties: own.ties,
        losses: own.losses,
        isWinner: own.isWinner,
      },
      unlocks: readHabitUnlocks(own.metadata?.habitUnlocks),
    };
  }
  return null;
}

/**
 * Merge outcome habit unlocks with profile pending celebrations; drop the ones
 * a trophy sheet already showed and repeats of the same definition.
 */
export function mergeCelebrationAchievements(
  unlocks: NoviceCelebrationAchievement[],
  pending: TrophyPendingCelebration[] | null | undefined,
): NoviceCelebrationAchievement[] {
  const seen = new Set<string>();
  const out: NoviceCelebrationAchievement[] = [];
  const candidates: NoviceCelebrationAchievement[] = [
    ...unlocks,
    ...(pending ?? []).map((p) => ({
      definitionId: p.definitionId,
      titleKey: p.titleKey,
      artKey: p.artKey,
      rarity: p.rarity,
      achievementId: p.achievementId,
    })),
  ];
  for (const item of candidates) {
    if (seen.has(item.definitionId)) continue;
    if (item.achievementId && wasCelebrationShown(item.achievementId)) continue;
    seen.add(item.definitionId);
    out.push(item);
  }
  return out;
}

async function fetchDetails(
  userId: string,
  pending: TrophyPendingCelebration[] | null | undefined,
): Promise<NoviceCelebrationDetails> {
  let latest: ReturnType<typeof pickLatestOwnOutcome> = null;
  try {
    const response = await gamesApi.getPastGames({ limit: 5 });
    latest = pickLatestOwnOutcome(response.data ?? [], userId);
  } catch {
    latest = null;
  }
  return {
    result: latest?.result ?? null,
    achievements: mergeCelebrationAchievements(latest?.unlocks ?? [], pending),
  };
}

/** Best effort, bounded by `DETAILS_TIMEOUT_MS`; never rejects. */
export async function loadNoviceCelebrationDetails(
  userId: string,
  pending: TrophyPendingCelebration[] | null | undefined,
): Promise<NoviceCelebrationDetails> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<NoviceCelebrationDetails>((resolve) => {
    timer = setTimeout(
      () => resolve({ result: null, achievements: mergeCelebrationAchievements([], pending) }),
      DETAILS_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([fetchDetails(userId, pending).catch(() => EMPTY), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
