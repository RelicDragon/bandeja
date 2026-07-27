import type { CSSProperties, MouseEvent } from 'react';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyDetailSheet } from '@/components/trophies/TrophyDetailSheet';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import {
  TROPHY_RARITY_TAG_CLASS,
  TROPHY_TILE_LABEL_SLOT_CLASS,
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
} from '@/components/trophies/trophyProgressStyles';
import { STACK_LABEL_WIDTH_REM } from '@/components/trophies/trophyStackGeometry';
import type { TrophyCabinetEntryView } from '@/types/trophies';

type TrophyStackIconProps = {
  entry: TrophyCabinetEntryView;
  locked: boolean;
  /** Highest tier in the family stack — golden highlight. */
  maxLevel?: boolean;
  labelVisible: boolean;
  interactive: boolean;
  isOwn: boolean;
  pinsEditable: boolean;
  pinnedInstanceIds: ReadonlySet<string>;
  ownerUserId?: string;
  openDetailOnClick?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

/** Borderless trophy face — only the rarity frame has a border. */
export function TrophyStackIcon({
  entry,
  locked,
  maxLevel = false,
  labelVisible,
  interactive,
  isOwn,
  pinsEditable,
  pinnedInstanceIds,
  ownerUserId,
  openDetailOnClick = false,
  className = '',
  style,
  onClick,
}: TrophyStackIconProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const { definition, instances, progress } = entry;
  const primary = instances[0] ?? null;
  const hasPinned = instances.some((i) => pinnedInstanceIds.has(i.id));
  const displayRarity = trophyMaxLevelDisplayRarity(maxLevel, !locked, definition.rarity);
  const frameLocked = trophyFrameLocked(locked);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick?.();
    if (openDetailOnClick) setOpen(true);
  };

  return (
    <>
      <div
        style={style}
        className={`relative flex w-full flex-col items-center gap-2 bg-transparent p-0 text-center ${className}`}
      >
        <button
          type="button"
          data-testid="trophy-icon-button"
          data-max-level={maxLevel ? 'true' : 'false'}
          onClick={handleClick}
          disabled={!interactive}
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : true}
          aria-label={t(definition.titleKey)}
          className={`relative rounded-2xl bg-transparent p-0 shadow-none outline-none transition focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 enabled:active:scale-[0.97] ${
            interactive ? '' : 'pointer-events-none'
          }`}
        >
          <div className="relative">
            {!locked && (
              <div
                className={`pointer-events-none absolute inset-0 -m-1 rounded-full bg-gradient-to-b opacity-70 blur-md ${rarityAuraClass(displayRarity)}`}
                aria-hidden
              />
            )}
            <TrophyRarityFrame
              rarity={displayRarity}
              locked={frameLocked}
              className="relative h-[4.5rem] w-[4.5rem] rounded-2xl shadow-[0_6px_14px_-8px_rgba(0,0,0,0.35)]"
            >
              <TrophyArt
                artKey={definition.artKey}
                locked={locked}
                className="h-12 w-14"
              />
            </TrophyRarityFrame>
            {hasPinned && labelVisible && (
              <span
                data-testid="trophy-pinned-badge"
                className="absolute -left-0.5 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[9px] font-black text-white shadow-sm ring-2 ring-white dark:ring-gray-900"
                aria-label={t('trophies.detail.pinnedBadge')}
              >
                ★
              </span>
            )}
          </div>
        </button>
        <motion.div
          data-stack-label={labelVisible ? 'visible' : 'hidden'}
          aria-hidden={!labelVisible}
          className="flex flex-col items-center px-0.5"
          style={{ width: `${STACK_LABEL_WIDTH_REM}rem` }}
          initial={false}
          animate={{
            opacity: labelVisible ? 1 : 0,
            y: labelVisible ? 0 : 5,
          }}
          transition={{
            duration: reduceMotion ? 0 : labelVisible ? 0.22 : 0.12,
            ease: 'easeOut',
          }}
        >
          <div
            data-testid="trophy-title-slot"
            className={TROPHY_TILE_LABEL_SLOT_CLASS}
          >
            <span
              className={`line-clamp-2 w-full break-words text-[11px] font-semibold leading-tight ${rarityTextClass(displayRarity, frameLocked)}`}
            >
              {t(definition.titleKey)}
            </span>
          </div>
          {showsRarityTag(definition.rarity) && (
            <span
              data-testid="trophy-rarity-tag"
              className={`mt-1 ${TROPHY_RARITY_TAG_CLASS} ${rarityBadgeClass(displayRarity, frameLocked)}`}
            >
              {t(rarityLabelKey(definition.rarity))}
            </span>
          )}
        </motion.div>
      </div>
      {openDetailOnClick && (
        <TrophyDetailSheet
          open={open}
          onOpenChange={setOpen}
          definition={definition}
          instance={primary}
          instances={instances}
          locked={locked}
          progress={progress}
          isMaxLevel={maxLevel}
          isOwn={isOwn}
          pinsEditable={pinsEditable}
          pinnedInstanceIds={pinnedInstanceIds}
          ownerUserId={ownerUserId}
        />
      )}
    </>
  );
}
