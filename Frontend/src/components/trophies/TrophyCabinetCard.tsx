import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyDetailSheet } from '@/components/trophies/TrophyDetailSheet';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import {
  rarityAuraClass,
  rarityTextClass,
} from '@/components/trophies/trophyRarityStyles';
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
        className={`group relative flex h-full w-full flex-col items-center gap-1.5 rounded-2xl px-1.5 pb-2 pt-2 text-center transition duration-200 hover:-translate-y-0.5 active:scale-[0.97] ${
          locked
            ? 'bg-gray-50/80 dark:bg-white/[0.03]'
            : 'bg-gradient-to-b from-white to-gray-50 shadow-sm ring-1 ring-black/[0.04] dark:from-white/[0.07] dark:to-white/[0.02] dark:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] dark:ring-white/[0.06]'
        }`}
      >
        <div className="relative flex w-full justify-center">
          {!locked && (
            <div
              className={`pointer-events-none absolute inset-0 -m-1 rounded-full bg-gradient-to-b opacity-70 blur-md ${rarityAuraClass(definition.rarity)}`}
              aria-hidden
            />
          )}
          <TrophyRarityFrame
            rarity={definition.rarity}
            locked={locked}
            className="relative h-[4.5rem] w-[4.5rem] rounded-2xl"
          >
            <motion.div
              key={locked ? 'locked' : `open-${instances[0]?.id ?? 'none'}`}
              initial={{ opacity: 0.5, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <TrophyArt artKey={definition.artKey} locked={locked} className="h-12 w-14" />
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
        <span
          className={`line-clamp-2 min-h-[2.2em] w-full px-0.5 text-[11px] font-semibold leading-tight ${rarityTextClass(definition.rarity, locked)}`}
        >
          {t(definition.titleKey)}
        </span>
        <div className="mt-auto w-full min-h-[0.875rem] px-1">
          {showProgress && progress && (
            <div className="h-1 overflow-hidden rounded-full bg-gray-200/90 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${Math.min(100, (progress.current / progress.target) * 100)}%` }}
              />
            </div>
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
