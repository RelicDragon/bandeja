import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { seatFilledEnter } from './spotOpenedMotion';
import {
  consumeSeatedFromQueue,
  hasSeatedFromQueuePending,
  hasShownSeatedFromQueue,
} from './seatedFromQueueMarker';

export interface SeatedFromQueueBannerProps {
  gameId: string;
  /** Live signal: `game-seat-filled` named this viewer while the page was open. */
  seatedLive?: boolean;
}

/**
 * PRD 347 — the one-time green "You were seated from the queue" header.
 *
 * Renders directly above PRD 346's attendance card when that card is present
 * and stands alone when it is not, so neither PRD has to know about the
 * other's markup. No confetti, by design.
 */
export function SeatedFromQueueBanner({ gameId, seatedLive = false }: SeatedFromQueueBannerProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    if (hasShownSeatedFromQueue(gameId)) return;
    if (!seatedLive && !hasSeatedFromQueuePending(gameId)) return;
    consumeSeatedFromQueue(gameId);
    setVisible(true);
  }, [gameId, seatedLive]);

  if (!visible) return null;

  const enter = seatFilledEnter(reduceMotion);

  return (
    <motion.div
      role="status"
      data-testid="seated-from-queue-banner"
      layout={!reduceMotion}
      initial={enter.initial}
      animate={enter.animate}
      transition={enter.transition}
      className="mb-2 flex items-center gap-2 rounded-xl bg-green-100 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
    >
      <CheckCircle2 size={16} aria-hidden />
      <span>{t('spots.seated.banner')}</span>
    </motion.div>
  );
}
