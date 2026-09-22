import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ListOrdered, UserPlus } from 'lucide-react';
import { Card } from '@/components';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { canMutateGameRoster } from '@shared/gameMutationLock';
import type { Game } from '@/types';
import { readQueueState } from './queueState';
import { openSpotFadeTransition } from './spotOpenedMotion';
import { hasOpenSpotHighlight } from './spotOpenedWindow';

export interface GameQueuePanelProps {
  game: Game;
  viewerUserId: string | undefined;
  /**
   * PRD 364 — the organizer's "Next steps" block already states the open seat,
   * so the dashed row is suppressed for them. Participants keep it. Default `false`.
   */
  hideOpenSpotRow?: boolean;
}

/**
 * PRD 347 — "You're #2 of 3 · Auto-fill is on, you'll be seated automatically".
 *
 * Rendered for anyone sitting in the join queue. Position updates live because
 * the panel reads straight off the `game` object the details shell already
 * refreshes on `game-updated` / `game-seat-filled`.
 *
 * Also carries the freed-seat affordance: while a seat is newly open the panel
 * shows a dashed "Open spot" row that fades in over 400 ms (instantly under
 * reduced motion).
 */
export function GameQueuePanel({ game, viewerUserId, hideOpenSpotRow = false }: GameQueuePanelProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();

  const queue = readQueueState(game, viewerUserId);
  const rosterMutable = canMutateGameRoster(game);
  const showOpenSpot =
    !hideOpenSpotRow && rosterMutable && queue.openSeats > 0 && hasOpenSpotHighlight(game);
  const showQueueLine = rosterMutable && queue.viewerPosition !== null;

  if (!showQueueLine && !showOpenSpot) return null;

  const fade = openSpotFadeTransition(reduceMotion);

  return (
    <Card className="p-3 sm:p-4" data-testid="game-queue-panel">
      <AnimatePresence initial={false}>
        {showOpenSpot ? (
          <motion.div
            key="open-spot"
            layout={!reduceMotion}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            data-testid="open-spot-slot"
            className="mb-2 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sky-400 bg-sky-50 px-3 py-2 dark:border-sky-600 dark:bg-sky-900/20"
          >
            <UserPlus size={16} className="text-sky-600 dark:text-sky-300" aria-hidden />
            <span className="text-sm font-medium text-sky-700 dark:text-sky-300">
              {t('spots.roster.openSpot')}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showQueueLine && queue.viewerPosition !== null ? (
        <div className="flex items-start gap-2" data-testid="queue-position-line">
          <ListOrdered
            size={16}
            className="mt-0.5 shrink-0 text-gray-500 dark:text-gray-400"
            aria-hidden
          />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-900 dark:text-white">
              {t('spots.queue.position', {
                position: queue.viewerPosition,
                count: queue.total,
              })}
            </span>
            {' · '}
            <span>
              {/*
                Three outcomes, not two. Auto-fill seats you without asking.
                Otherwise it depends on `allowDirectJoin`: on a direct-join game
                a queued player may take a free seat themselves (PRD 347's "Join
                now" push), so telling them the organizer decides is the
                opposite of what the API does.
              */}
              {queue.autoFillEnabled
                ? t('spots.queue.autoFillOn')
                : game.allowDirectJoin
                  ? t('spots.queue.tapToJoin')
                  : t('spots.queue.autoFillOff')}
            </span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}
