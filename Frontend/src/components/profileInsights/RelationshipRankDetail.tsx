import type { ComponentType } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PerformanceRelationshipEntry } from '@/api/users';
import { RelationshipGameList } from '@/components/profileInsights/RelationshipGameList';
import { RelationshipPersonCard } from '@/components/profileInsights/RelationshipPersonCard';
import { RelationshipPlaceSwitch } from '@/components/profileInsights/RelationshipPlaceSwitch';
import {
  clampRelationshipPlaceIndex,
  type RelationshipPlaceIndex,
  type RelationshipRankingMode,
} from '@/utils/profileRelationshipRankings';

const rankingModeLabels: Record<RelationshipRankingMode, string> = {
  formulae: 'playerCard.relationshipRankingFormulae',
  rating: 'playerCard.relationshipRankingRating',
  games: 'playerCard.relationshipRankingGames',
};

interface RelationshipRankDetailProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  tone: string;
  ranks: PerformanceRelationshipEntry[];
  placeIndex: RelationshipPlaceIndex;
  rankingMode: RelationshipRankingMode;
  onPlaceIndexChange: (placeIndex: RelationshipPlaceIndex) => void;
  onBack: () => void;
  onOpenGame?: () => void;
}

export function RelationshipRankDetail({
  icon: Icon,
  label,
  tone,
  ranks,
  placeIndex,
  rankingMode,
  onPlaceIndexChange,
  onBack,
  onOpenGame,
}: RelationshipRankDetailProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const clampedPlace = clampRelationshipPlaceIndex(ranks, placeIndex);
  const entry = ranks[clampedPlace];
  if (!entry) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200/80 bg-white/80 text-gray-600 shadow-sm transition-all duration-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-gray-600/70 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-950/40 dark:hover:text-primary-300 dark:focus-visible:ring-offset-gray-800"
          aria-label={t('common.back', { defaultValue: 'Back' })}
          onClick={onBack}
        >
          <ArrowLeft size={18} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <Icon size={15} className={tone} />
              <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {label}
              </h3>
            </div>
            <span
              className="inline-flex max-w-full truncate rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 ring-1 ring-primary-100 dark:bg-primary-950/40 dark:text-primary-200 dark:ring-primary-900/60"
              data-testid="relationship-ranking-method"
            >
              {t(rankingModeLabels[rankingMode])}
            </span>
          </div>
          <RelationshipPlaceSwitch
            rankCount={ranks.length}
            placeIndex={clampedPlace}
            onChange={onPlaceIndexChange}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={entry.user.id}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.16, ease: 'easeOut' }}
          className="space-y-3"
          aria-live="polite"
        >
          <RelationshipPersonCard entry={entry} />
          <RelationshipGameList games={entry.games ?? []} onOpenGame={onOpenGame} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
