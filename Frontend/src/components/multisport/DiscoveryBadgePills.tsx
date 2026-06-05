import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import { buildGameDiscoveryBadgeParts } from '@/utils/findDiscovery';

type DiscoveryBadgePillsProps = {
  game: Game;
};

const TIER_PILL_CLASS = {
  social:
    'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800/60',
  match:
    'bg-violet-50 text-violet-800 ring-1 ring-violet-200/80 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-800/60',
} as const;

export function DiscoveryBadgePills({ game }: DiscoveryBadgePillsProps) {
  const { t } = useTranslation();
  const parts = buildGameDiscoveryBadgeParts(game, t);

  if (!parts) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {parts ? (
        <>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIER_PILL_CLASS[parts.tier]}`}
          >
            {parts.tierLabel}
          </span>
          {parts.detailLabel ? (
            <span className="inline-flex max-w-full items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <span className="truncate">{parts.detailLabel}</span>
            </span>
          ) : null}
          {!game.affectsRating ? (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {t('games.noRating')}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
