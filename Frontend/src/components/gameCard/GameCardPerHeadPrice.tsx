import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import type { PerHeadPrice } from '@/types';
import { formatCostMinor } from '@/features/cost/costMoney';

/**
 * PRD 348 — "10 € per player" on a game card.
 *
 * Shows the derived per-head share instead of the raw total, because that is the
 * number a player decides on. The total is one press away and is *also* in the
 * accessible name, so it is never touch-only information.
 *
 * Two things this has to get right, and both were wrong at first:
 *
 * 1. **It is a real `<button>`.** `aria-label` is name-from-author, which does
 *    not apply to a generic `<span>` — the label was being dropped outright and
 *    the total never reached a screen reader. A button also makes the reveal
 *    reachable with Enter / Space.
 * 2. **The press never reaches the card.** The enclosing `Card` navigates to
 *    `/games/:id` on click, so a long-press used to flash the total for one
 *    frame and then route away. Every handler here stops propagation, and the
 *    long-press timer is cancelled by a scroll (`onTouchMove`).
 */

const LONG_PRESS_MS = 400;
const REVEAL_MS = 2000;
/** A finger that travels this far is scrolling, not pressing. */
const TOUCH_SLOP_PX = 10;

export const GameCardPerHeadPrice = memo(function GameCardPerHeadPrice({
  perHeadPrice,
}: {
  perHeadPrice: PerHeadPrice;
}) {
  const { t, i18n } = useTranslation();
  const [showTotal, setShowTotal] = useState(false);
  const pressTimer = useRef<number | null>(null);
  const revealTimer = useRef<number | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
    },
    [],
  );

  const perHead = formatCostMinor(perHeadPrice.amountCents, perHeadPrice.currency, i18n.language);
  const total = formatCostMinor(perHeadPrice.totalCents, perHeadPrice.currency, i18n.language);

  const totalLabel = t('cost.card.totalFor', {
    amount: total,
    players: perHeadPrice.payerCount,
  });
  const perHeadLabel = perHeadPrice.estimated
    ? t('cost.card.perPlayerEstimated', { amount: perHead })
    : t('cost.card.perPlayer', { amount: perHead });

  const reveal = () => {
    setShowTotal(true);
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setShowTotal(false), REVEAL_MS);
  };

  const endPress = () => {
    touchOrigin.current = null;
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = (event: React.TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    touchOrigin.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(reveal, LONG_PRESS_MS);
  };

  const trackPress = (event: React.TouchEvent<HTMLButtonElement>) => {
    const origin = touchOrigin.current;
    const touch = event.touches[0];
    if (!origin || !touch) return;
    const moved =
      Math.abs(touch.clientX - origin.x) > TOUCH_SLOP_PX ||
      Math.abs(touch.clientY - origin.y) > TOUCH_SLOP_PX;
    if (moved) endPress();
  };

  return (
    <button
      type="button"
      className="flex min-h-[1.75rem] items-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
      title={totalLabel}
      aria-label={`${perHeadLabel} · ${totalLabel}`}
      onClick={(event) => {
        // The card behind this pill navigates on click; the price row is a
        // control of its own and must not trigger it.
        event.stopPropagation();
        endPress();
        if (showTotal) {
          if (revealTimer.current) window.clearTimeout(revealTimer.current);
          setShowTotal(false);
          return;
        }
        reveal();
      }}
      onTouchStart={startPress}
      onTouchMove={trackPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        reveal();
      }}
    >
      <Wallet size={13} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
      <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-300" aria-hidden>
        {showTotal ? totalLabel : perHeadLabel}
      </span>
    </button>
  );
});
