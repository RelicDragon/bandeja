import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyDetailSheet } from '@/components/trophies/TrophyDetailSheet';
import { TrophyRarityBadge } from '@/components/trophies/TrophyRarityBadge';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import { rarityTextClass } from '@/components/trophies/trophyRarityStyles';
import type {
  TrophyCabinetEntryView,
  TrophyDefinitionView,
  TrophyInstanceView,
} from '@/types/trophies';

type TrophyCabinetCardProps = {
  entry: TrophyCabinetEntryView;
  isOwn: boolean;
  pinsEditable?: boolean;
  pinnedInstanceIds?: ReadonlySet<string>;
  ownerUserId?: string;
};

export function TrophyCabinetCard({
  entry,
  isOwn,
  pinsEditable = false,
  pinnedInstanceIds,
  ownerUserId,
}: TrophyCabinetCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { definition, unlocked, instances, progress } = entry;
  const primary = instances[0] ?? null;
  const locked = !unlocked;
  const hasPinned = instances.some((i) => pinnedInstanceIds?.has(i.id));
  const showProgress = locked && isOwn && Boolean(progress);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative flex h-full w-full flex-col items-center gap-2 rounded-2xl border p-2.5 text-center transition duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${
          locked
            ? 'border-gray-200/80 bg-gray-50/90 dark:border-gray-700/60 dark:bg-gray-900/40'
            : 'border-gray-200/70 bg-white shadow-sm hover:shadow-md dark:border-gray-700/50 dark:bg-gray-900/70'
        }`}
      >
        <div className="relative w-full shrink-0">
          <TrophyRarityFrame rarity={definition.rarity} locked={locked} className="mx-auto h-[4.75rem] w-full max-w-[5.5rem]">
            <motion.div
              key={locked ? 'locked' : `open-${instances[0]?.id ?? 'none'}`}
              initial={{ opacity: 0.5, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <TrophyArt artKey={definition.artKey} locked={locked} className="h-14 w-16" />
            </motion.div>
          </TrophyRarityFrame>
          {instances.length > 1 && (
            <span className="absolute -right-0.5 -top-1 rounded-full bg-gray-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900">
              ×{instances.length}
            </span>
          )}
          {hasPinned && (
            <span
              className="absolute -left-0.5 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[9px] font-black text-white shadow-sm ring-2 ring-white dark:ring-gray-900"
              aria-label={t('trophies.detail.pinnedBadge')}
            >
              ✦
            </span>
          )}
        </div>
        <TrophyRarityBadge rarity={definition.rarity} locked={locked} />
        <span
          className={`line-clamp-2 min-h-[2.2em] flex-1 text-[11px] font-semibold leading-tight ${rarityTextClass(definition.rarity, locked)}`}
        >
          {t(definition.titleKey)}
        </span>
        <div className="mt-auto w-full min-h-[1.375rem] px-0.5">
          {showProgress && progress && (
            <>
              <div className="h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{ width: `${Math.min(100, (progress.current / progress.target) * 100)}%` }}
                />
              </div>
              <div className="mt-0.5 text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                {progress.current}/{progress.target}
              </div>
            </>
          )}
        </div>
      </button>
      <TrophyDetailSheet
        open={open}
        onOpenChange={setOpen}
        definition={definition}
        instance={primary}
        instances={instances}
        locked={locked}
        progress={progress}
        isOwn={isOwn}
        pinsEditable={pinsEditable}
        pinnedInstanceIds={pinnedInstanceIds}
        ownerUserId={ownerUserId}
      />
    </>
  );
}

export type { TrophyDefinitionView, TrophyInstanceView };
