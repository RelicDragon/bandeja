import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import { buildGameDiscoveryBadgeParts } from '@/utils/findDiscovery';

type DiscoveryBadgePillsProps = {
  game: Game;
};

export function DiscoveryBadgePills({ game }: DiscoveryBadgePillsProps) {
  const { t } = useTranslation();
  const parts = buildGameDiscoveryBadgeParts(game, t);

  if (!parts) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="inline-flex max-w-full items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <span className="truncate">{parts.label}</span>
      </span>
      {!game.affectsRating ? (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {t('games.noRating')}
        </span>
      ) : null}
    </div>
  );
}
