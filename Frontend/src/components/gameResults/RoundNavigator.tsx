import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus } from 'lucide-react';
import type { Round } from '@/types/gameResults';
import { getRoundResultsHeaderTone, type RoundResultsHeaderTone, type ScoringRules } from '@/utils/scoring';
import { roundMatchProgress } from '@/utils/resultsBoardNavigation';

interface RoundNavigatorProps {
  /** Rounds shown on the board (viewers only see rounds with scores). */
  rounds: Round[];
  /** Every round, so numbering matches the round cards. */
  allRounds: Round[];
  rules: ScoringRules;
  activeRoundId: string | null;
  onSelect: (roundId: string) => void;
  onAddRound?: () => void;
  stickyTop: string;
}

const CHIP_TONE: Record<RoundResultsHeaderTone, string> = {
  neutral: 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
  in_progress:
    'border-amber-300/80 bg-amber-50 text-amber-800 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-200',
  complete:
    'border-emerald-300/80 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200',
};

export const RoundNavigator = ({
  rounds,
  allRounds,
  rules,
  activeRoundId,
  onSelect,
  onAddRound,
  stickyTop,
}: RoundNavigatorProps) => {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !activeRoundId) return;
    const chip = scroller.querySelector<HTMLElement>(`[data-round-chip="${activeRoundId}"]`);
    if (!chip) return;
    // Scroll the chip row only; scrollIntoView would also move the page.
    const left = chip.offsetLeft - scroller.clientWidth / 2 + chip.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [activeRoundId, rounds.length]);

  return (
    <nav
      aria-label={t('gameResults.roundNavigator')}
      className="sticky z-20 -mx-2 bg-gray-50/90 px-2 py-1.5 backdrop-blur-md dark:bg-gray-900/90"
      style={{ top: stickyTop }}
    >
      <div
        ref={scrollerRef}
        className="scrollbar-hide flex gap-1.5 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
      >
        {rounds.map((round) => {
          const number = allRounds.findIndex((r) => r.id === round.id) + 1;
          const tone = getRoundResultsHeaderTone(round, rules);
          const { finished, total } = roundMatchProgress(round, rules);
          const active = round.id === activeRoundId;
          return (
            <button
              key={round.id}
              type="button"
              data-round-chip={round.id}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(round.id)}
              className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold tabular-nums transition-[box-shadow,transform] active:scale-95 ${CHIP_TONE[tone]} ${
                active ? 'ring-2 ring-primary-500 ring-offset-1 ring-offset-gray-50 dark:ring-offset-gray-900' : ''
              }`}
            >
              {tone === 'complete' ? <Check size={13} strokeWidth={2.75} aria-hidden /> : null}
              {t('gameResults.roundShort', { number })}
              {tone === 'in_progress' && total > 1 ? (
                <span className="font-medium opacity-80">
                  · {finished}/{total}
                </span>
              ) : null}
            </button>
          );
        })}
        {onAddRound ? (
          <button
            type="button"
            onClick={onAddRound}
            aria-label={t('gameResults.addRound')}
            title={t('gameResults.addRound')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-primary-300 text-primary-600 transition-colors hover:bg-primary-50 active:scale-95 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-950/40"
          >
            <Plus size={16} aria-hidden />
          </button>
        ) : null}
      </div>
    </nav>
  );
};
