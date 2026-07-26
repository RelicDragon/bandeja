import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { useAuthStore } from '@/store/authStore';
import type { GameOutcome } from '@/types';
import type { TrophyRarity } from '@/types/trophies';

type HabitUnlockMeta = {
  definitionId: string;
  rarity: TrophyRarity;
  artKey: string;
  titleKey: string;
};

type TrophyUnlockBannerProps = {
  gameId: string;
  outcomes?: GameOutcome[];
};

function isCommon(value: string): value is 'COMMON' {
  return value === 'COMMON';
}

function readCommonUnlocks(outcome: GameOutcome): HabitUnlockMeta[] {
  const meta = outcome.metadata;
  if (!meta || typeof meta !== 'object') return [];
  const bags = [meta.habitUnlocks, meta.trophyUnlocks];
  const out: HabitUnlockMeta[] = [];
  const seen = new Set<string>();
  for (const raw of bags) {
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.definitionId !== 'string' ||
        typeof row.rarity !== 'string' ||
        typeof row.artKey !== 'string' ||
        typeof row.titleKey !== 'string' ||
        !isCommon(row.rarity)
      ) {
        continue;
      }
      if (seen.has(row.definitionId)) continue;
      seen.add(row.definitionId);
      out.push({
        definitionId: row.definitionId,
        rarity: 'COMMON',
        artKey: row.artKey,
        titleKey: row.titleKey,
      });
    }
  }
  return out;
}

/** Prefer higher volume/streak thresholds when several commons unlock together. */
function pickPrimaryCommon(unlocks: HabitUnlockMeta[]): HabitUnlockMeta | null {
  if (unlocks.length === 0) return null;
  const rank = (id: string) => {
    if (id === 'habit_games_100') return 100;
    if (id === 'habit_games_50') return 50;
    if (id === 'habit_games_10') return 10;
    if (id === 'habit_streak_4') return 4;
    if (id === 'habit_first_win') return 1;
    return 0;
  };
  return [...unlocks].sort((a, b) => rank(b.definitionId) - rank(a.definitionId))[0] ?? null;
}

/** Common unlocks only — Rare/Legendary use TrophyCelebrationSheet. */
export function TrophyUnlockBanner({ gameId, outcomes }: TrophyUnlockBannerProps) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [unlock, setUnlock] = useState<HabitUnlockMeta | null>(null);
  const [extraCount, setExtraCount] = useState(0);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !outcomes?.length) return;
    const key = `trophyUnlockBanner:${gameId}:${userId}`;
    if (shownRef.current === key || sessionStorage.getItem(key)) return;
    const own = outcomes.find((o) => o.userId === userId);
    if (!own) return;
    const commons = readCommonUnlocks(own);
    const primary = pickPrimaryCommon(commons);
    if (!primary) return;
    shownRef.current = key;
    sessionStorage.setItem(key, '1');
    setUnlock(primary);
    setExtraCount(Math.max(0, commons.length - 1));
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(timer);
  }, [gameId, outcomes, userId]);

  return (
    <AnimatePresence>
      {visible && unlock && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className="mb-3 overflow-hidden rounded-2xl border border-emerald-400/35 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-3 py-2.5 text-white shadow-lg shadow-emerald-600/20"
          role="status"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
              <TrophyArt artKey={unlock.artKey} className="h-9 w-10" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-50/90">
                {t('trophies.banner.unlocked')}
              </p>
              <p className="truncate text-sm font-bold leading-tight">
                {t(unlock.titleKey)}
                {extraCount > 0 ? (
                  <span className="ml-1 font-semibold text-emerald-100">
                    {t('trophies.banner.andMore', { count: extraCount })}
                  </span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-white/90 hover:bg-white/10"
              aria-label={t('trophies.banner.dismiss')}
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
