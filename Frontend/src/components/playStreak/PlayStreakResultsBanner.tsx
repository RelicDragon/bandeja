import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import type { GameOutcome } from '@/types';

type PlayStreakResultsBannerProps = {
  gameId: string;
  outcomes?: GameOutcome[];
};

function readAdvanced(outcome: GameOutcome): { advanced: boolean; count: number } | null {
  const meta = outcome.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const advanced = meta.playStreakAdvanced === true;
  const after = meta.playStreakAfter;
  const count =
    after && typeof after === 'object' && typeof (after as { count?: unknown }).count === 'number'
      ? (after as { count: number }).count
      : 0;
  if (!meta.playStreakApplied) return null;
  return { advanced, count };
}

export function PlayStreakResultsBanner({ gameId, outcomes }: PlayStreakResultsBannerProps) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !outcomes?.length) return;
    const key = `playStreakBanner:${gameId}:${userId}`;
    if (shownRef.current === key || sessionStorage.getItem(key)) return;
    const own = outcomes.find((o) => o.userId === userId);
    if (!own) return;
    const info = readAdvanced(own);
    if (!info?.advanced || info.count <= 0) return;
    shownRef.current = key;
    sessionStorage.setItem(key, '1');
    setCount(info.count);
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, [gameId, outcomes, userId]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className="mb-3 flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-md"
          role="status"
        >
          <Flame size={18} className="fill-white" aria-hidden />
          <span>
            {count <= 1 ? t('playStreak.bannerStarted') : t('playStreak.bannerContinue', { count })}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
