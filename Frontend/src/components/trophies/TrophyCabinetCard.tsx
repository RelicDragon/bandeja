import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { isCatalogFamilyMaxLevel } from '@/components/trophies/cabinetGrouping';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyDetailSheet } from '@/components/trophies/TrophyDetailSheet';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import {
  TROPHY_RARITY_TAG_CLASS,
  TROPHY_TILE_ART_SLOT_CLASS,
  TROPHY_TILE_FOOTER_SLOT_CLASS,
  TROPHY_TILE_LABEL_SLOT_CLASS,
  TROPHY_TILE_PROGRESS_SLOT_CLASS,
  trophyTileButtonClass,
} from '@/components/trophies/trophyCabinetTileChrome';
import {
  rarityAuraClass,
  rarityBadgeClass,
  rarityLabelKey,
  rarityTextClass,
  showsRarityTag,
} from '@/components/trophies/trophyRarityStyles';
import {
  trophyFrameLocked,
  trophyMaxLevelDisplayRarity,
  trophyProgressFillClass,
} from '@/components/trophies/trophyProgressStyles';
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
  const isMaxLevel = isCatalogFamilyMaxLevel(definition);
  const displayRarity = trophyMaxLevelDisplayRarity(isMaxLevel, definition.rarity);
  const frameLocked = trophyFrameLocked(locked, isMaxLevel);
  const hasPinned = instances.some((i) => pinnedInstanceIds?.has(i.id));
  const progressSafe =
    progress != null &&
    progress.target > 0 &&
    Number.isFinite(progress.current) &&
    Number.isFinite(progress.target);
  const showProgress = locked && isOwn && progressSafe;
  const progressPct = showProgress
    ? Math.min(100, Math.max(0, (progress!.current / progress!.target) * 100))
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-max-level={isMaxLevel ? 'true' : 'false'}
        className={trophyTileButtonClass(locked)}
      >
        <div className={TROPHY_TILE_ART_SLOT_CLASS}>
          {(!locked || isMaxLevel) && (
            <div
              className={`pointer-events-none absolute inset-0 -m-1 rounded-full bg-gradient-to-b opacity-70 blur-md ${rarityAuraClass(displayRarity)}`}
              aria-hidden
            />
          )}
          <TrophyRarityFrame
            rarity={displayRarity}
            locked={frameLocked}
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
        <div
          data-testid="trophy-title-slot"
          className={TROPHY_TILE_LABEL_SLOT_CLASS}
        >
          <span
            className={`line-clamp-2 w-full text-[11px] font-semibold leading-tight ${rarityTextClass(displayRarity, frameLocked)}`}
          >
            {t(definition.titleKey)}
          </span>
        </div>
        <div
          data-testid="trophy-card-footer"
          className={TROPHY_TILE_FOOTER_SLOT_CLASS}
        >
          {showsRarityTag(definition.rarity) && (
            <span
              data-testid="trophy-rarity-tag"
              className={`${TROPHY_RARITY_TAG_CLASS} ${rarityBadgeClass(displayRarity, frameLocked)}`}
            >
              {t(rarityLabelKey(definition.rarity))}
            </span>
          )}
          <div className={TROPHY_TILE_PROGRESS_SLOT_CLASS}>
            {showProgress && progress && (
              <div
                data-testid="trophy-progress"
                className="h-full overflow-hidden rounded-full bg-gray-200/90 dark:bg-white/10"
              >
                <div
                  data-testid="trophy-progress-fill"
                  data-max-level={isMaxLevel ? 'true' : 'false'}
                  className={`h-full rounded-full transition-all ${trophyProgressFillClass(isMaxLevel)}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>
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
        isMaxLevel={isMaxLevel}
        isOwn={isOwn}
        pinsEditable={pinsEditable}
        pinnedInstanceIds={pinnedInstanceIds}
        ownerUserId={ownerUserId}
      />
    </>
  );
}

export type { TrophyDefinitionView, TrophyInstanceView };
