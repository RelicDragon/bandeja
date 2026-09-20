import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { pairsApi } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import type { Sport } from '@/types';
import { isPositiveChemistry, usePairFormatters } from './pairFormat';

export interface ChemistryChipProps {
  /** The two players of the pair, in any order; PRD 352 normalizes to `userAId < userBId`. */
  userAId: string;
  userBId: string;
  /**
   * The already-known chemistry in percentage points. Pass it wherever the
   * caller has it (the leaderboard row, the partner card, the pair sheet) — the
   * chip then renders without a request, which is what keeps the hot list cheap.
   * Omit it and the chip fetches the pair on its own.
   */
  chemistry?: number | null;
  /** Sport context for the self-fetching mode. Defaults to the viewer's primary sport. */
  sport?: Sport;
  className?: string;
}

const LONG_PRESS_MS = 400;

/**
 * "Chemistry": how many win-rate points a pair gains over its members' solo
 * average. Green from +5, neutral below that, and **nothing at all** when the
 * number is unknown — a missing baseline must never render as a confident `0`.
 *
 * Colour is never the only signal: the accessible name always spells the value
 * out, and a long press (or hover, or focus) reveals what it means.
 */
export const ChemistryChip = memo(
  ({ userAId, userBId, chemistry, sport, className = '' }: ChemistryChipProps) => {
    const { t } = useTranslation();
    const formatters = usePairFormatters();
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const timerRef = useRef<number | null>(null);

    const shouldFetch = chemistry === undefined;
    const pairId = `${userAId},${userBId}`;
    const { data } = useQuery({
      queryKey: queryKeys.pairs.detail(pairId, sport),
      queryFn: () => pairsApi.getPair(pairId, sport),
      enabled: shouldFetch && Boolean(userAId) && Boolean(userBId),
      staleTime: 5 * 60 * 1000,
    });

    const value = shouldFetch ? (data?.chemistry ?? null) : chemistry;

    const clearTimer = useCallback(() => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }, []);

    useEffect(() => clearTimer, [clearTimer]);

    const handlePressStart = useCallback(() => {
      clearTimer();
      timerRef.current = window.setTimeout(() => setTooltipOpen(true), LONG_PRESS_MS);
    }, [clearTimer]);

    const handlePressEnd = useCallback(() => {
      clearTimer();
      setTooltipOpen(false);
    }, [clearTimer]);

    if (value === null || value === undefined) return null;

    const positive = isPositiveChemistry(value);
    const tone = positive
      ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
    const tooltip = t('pairs.chemistry.tooltip');

    return (
      <span className={`relative inline-flex ${className}`.trim()}>
        <button
          type="button"
          className={`inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center gap-1 rounded-full px-2.5 text-xs font-semibold tabular-nums transition-colors ${tone}`}
          aria-label={t('pairs.chemistry.aria', { value: formatters.signed(value) })}
          aria-describedby={tooltipOpen ? `${pairId}-chemistry-tip` : undefined}
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerLeave={handlePressEnd}
          onPointerCancel={handlePressEnd}
          onContextMenu={(event) => event.preventDefault()}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={handlePressEnd}
          onClick={() => setTooltipOpen((open) => !open)}
        >
          <Zap size={13} strokeWidth={2.25} aria-hidden />
          <span aria-hidden>{formatters.signed(value)}</span>
        </button>
        {tooltipOpen ? (
          <span
            id={`${pairId}-chemistry-tip`}
            role="tooltip"
            className="pointer-events-none absolute bottom-full end-0 z-20 mb-1 w-max max-w-[12rem] rounded-lg bg-gray-900 px-2 py-1 text-[11px] leading-snug text-white shadow-lg dark:bg-gray-700"
          >
            {tooltip}
          </span>
        ) : null}
      </span>
    );
  },
);

ChemistryChip.displayName = 'ChemistryChip';
