import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyRarityBadge } from '@/components/trophies/TrophyRarityBadge';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import {
  rarityAuraClass,
  rarityCelebrationShell,
} from '@/components/trophies/trophyRarityStyles';
import {
  claimCelebration,
  isCelebrationPersisted,
  markCelebrationShown,
  releaseCelebrationClaim,
  TROPHY_CELEBRATION_RELEASED,
  wasCelebrationShown,
} from '@/components/trophies/trophyCelebrationGate';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api/users';
import { buildUrl } from '@/utils/urlSchema';
import { getSportConfig } from '@/sport/sportRegistry';
import type { GameOutcome, Sport } from '@/types';
import type { TrophyRarity } from '@/types/trophies';
import { isAxiosError } from 'axios';

export type CelebrationUnlock = {
  definitionId: string;
  rarity: TrophyRarity;
  artKey: string;
  titleKey: string;
  achievementId?: string;
  place?: number;
  sport?: string | null;
};

type TrophyCelebrationSheetProps = {
  gameId?: string;
  outcomes?: GameOutcome[];
  /** Owner pending Rare/Legendary unlocks (season FINAL, missed results tab, etc.). */
  pending?: CelebrationUnlock[];
  /** True when opened inside another Vaul drawer (player card). */
  nested?: boolean;
};

const SPARKS = [
  { x: -52, y: -38, delay: 0.04, size: 5 },
  { x: 46, y: -42, delay: 0.1, size: 4 },
  { x: -34, y: 26, delay: 0.16, size: 3 },
  { x: 40, y: 24, delay: 0.08, size: 4 },
  { x: 2, y: -54, delay: 0.18, size: 3 },
  { x: -58, y: 2, delay: 0.12, size: 3 },
] as const;

function isRareOrLegendary(rarity: string): rarity is 'RARE' | 'LEGENDARY' {
  return rarity === 'RARE' || rarity === 'LEGENDARY';
}

function readUnlocksFromOutcome(outcome: GameOutcome): CelebrationUnlock[] {
  const meta = outcome.metadata;
  if (!meta || typeof meta !== 'object') return [];
  const out: CelebrationUnlock[] = [];
  const seen = new Set<string>();

  const pushRaw = (raw: unknown) => {
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      if (
        typeof row.definitionId !== 'string' ||
        typeof row.rarity !== 'string' ||
        typeof row.artKey !== 'string' ||
        typeof row.titleKey !== 'string'
      ) {
        continue;
      }
      if (!isRareOrLegendary(row.rarity)) continue;
      if (seen.has(row.definitionId)) continue;
      seen.add(row.definitionId);
      out.push({
        definitionId: row.definitionId,
        rarity: row.rarity,
        artKey: row.artKey,
        titleKey: row.titleKey,
        ...(typeof row.achievementId === 'string' ? { achievementId: row.achievementId } : {}),
        ...(typeof row.place === 'number' ? { place: row.place } : {}),
        ...(typeof row.sport === 'string' || row.sport === null
          ? { sport: row.sport as string | null }
          : {}),
      });
    }
  };

  pushRaw(meta.podiumUnlocks);
  pushRaw(meta.habitUnlocks);
  pushRaw(meta.trophyUnlocks);
  return out;
}

function pickPrimaryCelebration(unlocks: CelebrationUnlock[]): CelebrationUnlock | null {
  if (unlocks.length === 0) return null;
  const rank = (u: CelebrationUnlock) => {
    if (u.rarity === 'LEGENDARY') return 300 + (u.place === 1 ? 10 : 0);
    if (u.definitionId === 'habit_streak_12') return 220;
    if (u.definitionId === 'habit_streak_8') return 210;
    if (u.place === 2) return 200;
    if (u.place === 3) return 190;
    return 100;
  };
  return [...unlocks].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

export function TrophyCelebrationSheet({
  gameId,
  outcomes,
  pending,
  nested = false,
}: TrophyCelebrationSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const [unlock, setUnlock] = useState<CelebrationUnlock | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinFull, setPinFull] = useState(false);
  const [queueTick, setQueueTick] = useState(0);
  const unlockRef = useRef<CelebrationUnlock | null>(null);
  const openRef = useRef(false);
  const claimedIdRef = useRef<string | null>(null);
  unlockRef.current = unlock;
  openRef.current = open;

  useEffect(() => {
    if (!userId) return;

    const abandonActiveClaim = () => {
      const id = claimedIdRef.current ?? unlockRef.current?.achievementId;
      if (id && !isCelebrationPersisted(id)) {
        releaseCelebrationClaim(id);
      }
      claimedIdRef.current = null;
      setOpen(false);
      setUnlock(null);
    };

    const alreadyShown = (u: CelebrationUnlock) => {
      if (!u.achievementId) return false;
      return wasCelebrationShown(u.achievementId);
    };

    const matchesCurrent = (u: CelebrationUnlock, current: CelebrationUnlock) => {
      if (current.achievementId && u.achievementId) {
        return current.achievementId === u.achievementId;
      }
      return current.definitionId === u.definitionId && current.place === u.place;
    };

    let candidates: CelebrationUnlock[] = [];

    if (pending && pending.length > 0) {
      candidates = pending.filter((u) => Boolean(u.achievementId));
    } else if (gameId && outcomes?.length) {
      const own = outcomes.find((o) => o.userId === userId);
      if (!own) {
        abandonActiveClaim();
        return;
      }
      candidates = readUnlocksFromOutcome(own).filter((u) => Boolean(u.achievementId));
      if (candidates.length === 0) {
        abandonActiveClaim();
        return;
      }
    } else {
      abandonActiveClaim();
      return;
    }

    const current = unlockRef.current;
    if (openRef.current && current) {
      const stillValid = candidates.some((u) => matchesCurrent(u, current));
      if (stillValid) return;
      if (current.achievementId) {
        releaseCelebrationClaim(current.achievementId);
        if (claimedIdRef.current === current.achievementId) {
          claimedIdRef.current = null;
        }
      }
    }

    const unseen = candidates.filter((u) => !alreadyShown(u));
    const primary = pickPrimaryCelebration(unseen);
    if (!primary?.achievementId) {
      abandonActiveClaim();
      return;
    }

    if (!claimCelebration(primary.achievementId)) {
      setOpen(false);
      setUnlock(null);
      return;
    }

    claimedIdRef.current = primary.achievementId;
    setUnlock(primary);
    setPinned(false);
    setPinError(false);
    setPinFull(false);
    setOpen(true);
  }, [gameId, outcomes, pending, userId, queueTick]);

  // Losing soft-claim host retries when the winning host releases without persisting.
  useEffect(() => {
    const onRelease = () => setQueueTick((n) => n + 1);
    window.addEventListener(TROPHY_CELEBRATION_RELEASED, onRelease);
    return () => window.removeEventListener(TROPHY_CELEBRATION_RELEASED, onRelease);
  }, []);

  const persistAndClose = (nextOpen: boolean) => {
    const id = unlockRef.current?.achievementId ?? claimedIdRef.current;
    if (!nextOpen && id) {
      markCelebrationShown(id);
      claimedIdRef.current = null;
      setOpen(false);
      setUnlock(null);
      // Advance multi-unlock queue after dismiss.
      setQueueTick((n) => n + 1);
      return;
    }
    setOpen(nextOpen);
  };

  // Always release soft claim on unmount if not persisted (even if open never committed).
  useEffect(() => {
    return () => {
      const id = claimedIdRef.current ?? unlockRef.current?.achievementId;
      if (id && !isCelebrationPersisted(id)) {
        releaseCelebrationClaim(id);
      }
      claimedIdRef.current = null;
    };
  }, []);

  const sportLabel = (() => {
    if (!unlock?.sport) return null;
    try {
      return t(getSportConfig(unlock.sport as Sport).labelKey);
    } catch {
      return null;
    }
  })();

  const handlePin = async () => {
    if (!unlock?.achievementId || pinning || pinned) return;
    setPinning(true);
    setPinError(false);
    setPinFull(false);
    try {
      await usersApi.pinAchievement(unlock.achievementId);
      setPinned(true);
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['users', 'stats', userId] });
      }
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const code = isAxiosError(err) ? err.response?.data?.code : undefined;
      if (status === 409 || code === 'trophy.pinsFull') setPinFull(true);
      else setPinError(true);
    } finally {
      setPinning(false);
    }
  };

  const handleViewCabinet = () => {
    persistAndClose(false);
    if (userId) {
      navigate(buildUrl('userProfile', { id: userId }));
    } else {
      navigate(buildUrl('profile'));
    }
  };

  const sparkColor =
    unlock?.rarity === 'LEGENDARY'
      ? 'bg-amber-400'
      : unlock?.rarity === 'RARE'
        ? 'bg-cyan-400'
        : 'bg-emerald-400';

  return (
    <Drawer open={open} onOpenChange={persistAndClose} nested={nested}>
      <DrawerContent className="mx-auto max-w-lg overflow-hidden !border-0 !bg-transparent shadow-none">
        <AnimatePresence>
          {unlock && (
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              className={`relative mx-2 mb-2 overflow-hidden rounded-3xl border bg-gradient-to-b px-5 pb-6 pt-5 shadow-2xl ${rarityCelebrationShell(unlock.rarity)}`}
            >
              <div
                className={`pointer-events-none absolute inset-x-6 top-0 h-36 bg-gradient-to-b ${rarityAuraClass(unlock.rarity)} blur-2xl`}
                aria-hidden
              />

              <DrawerHeader className="relative z-10 space-y-2 text-center sm:text-center">
                <div className="relative mx-auto mb-1 flex h-36 w-36 items-center justify-center">
                  {SPARKS.map((spark, i) => (
                    <motion.span
                      key={i}
                      className={`absolute rounded-full ${sparkColor}`}
                      style={{ width: spark.size, height: spark.size }}
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0.35 }}
                      animate={
                        open
                          ? {
                              opacity: [0, 1, 0],
                              x: spark.x,
                              y: spark.y,
                              scale: [0.35, 1.1, 0.55],
                            }
                          : { opacity: 0 }
                      }
                      transition={{
                        duration: 0.85,
                        delay: spark.delay,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      aria-hidden
                    />
                  ))}

                  <motion.div
                    initial={{ scale: 0.68, rotate: -10, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.04 }}
                  >
                    <TrophyRarityFrame
                      rarity={unlock.rarity}
                      className="h-28 w-28 rounded-3xl"
                    >
                      <TrophyArt artKey={unlock.artKey} className="h-20 w-24" />
                    </TrophyRarityFrame>
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.28 }}
                  className="flex flex-col items-center gap-2"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                    {t('trophies.celebration.unlocked')}
                  </p>
                  <TrophyRarityBadge rarity={unlock.rarity} />
                  <DrawerTitle className="text-2xl font-black tracking-tight text-gray-950 dark:text-white">
                    {t(unlock.titleKey)}
                  </DrawerTitle>
                  <DrawerDescription className="max-w-sm text-center text-sm text-gray-600 dark:text-gray-300">
                    {t('trophies.celebration.subtitle')}
                    {sportLabel ? ` · ${sportLabel}` : ''}
                  </DrawerDescription>
                </motion.div>
              </DrawerHeader>

              <div className="relative z-10 mt-5 flex flex-col gap-2">
                {unlock.achievementId && (
                  <button
                    type="button"
                    disabled={pinning || pinned}
                    onClick={() => void handlePin()}
                    className="rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-70 dark:bg-primary-500 dark:hover:bg-primary-400"
                  >
                    {pinned
                      ? t('trophies.celebration.pinned')
                      : pinning
                        ? t('trophies.celebration.pinning')
                        : t('trophies.celebration.pin')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleViewCabinet}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99] ${
                    unlock.achievementId
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15'
                      : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400'
                  }`}
                >
                  {t('trophies.celebration.viewCabinet')}
                </button>
                <button
                  type="button"
                  onClick={() => persistAndClose(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                >
                  {t('trophies.celebration.dismiss')}
                </button>
                {pinFull && (
                  <p className="text-center text-xs text-rose-600 dark:text-rose-300">
                    {t('trophies.celebration.pinsFull')}
                  </p>
                )}
                {pinError && (
                  <p className="text-center text-xs text-rose-600 dark:text-rose-300">
                    {t('trophies.celebration.pinError')}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}
