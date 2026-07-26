import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import {
  rarityAuraClass,
  rarityTextClass,
} from '@/components/trophies/trophyRarityStyles';
import {
  pileBoxSizeRem,
  pileLayerStyle,
  selectPileLayers,
  stackFamilyLabelKey,
} from '@/components/trophies/trophyStackGeometry';
import type { TrophyCabinetEntryView } from '@/types/trophies';

type TrophyCabinetPileProps = {
  entries: TrophyCabinetEntryView[];
  locked: boolean;
  hasPinned: boolean;
  labelId: string;
  isOwn: boolean;
  reduceMotion?: boolean;
  onExpand: () => void;
};

export function TrophyCabinetPile({
  entries,
  locked,
  hasPinned,
  labelId,
  isOwn,
  reduceMotion = false,
  onExpand,
}: TrophyCabinetPileProps) {
  const { t } = useTranslation();
  if (entries.length < 2) return null;

  const top = entries[0]!;
  // Locked chase = easiest remaining (last in best→worst order).
  const nextChase = locked ? entries[entries.length - 1]! : null;
  const progress = nextChase?.progress;
  const showProgress =
    locked &&
    isOwn &&
    progress != null &&
    progress.target > 0 &&
    Number.isFinite(progress.current) &&
    Number.isFinite(progress.target);
  const layers = selectPileLayers(entries);
  const box = pileBoxSizeRem(layers.length);
  const familyKey = stackFamilyLabelKey(top.definition.ruleKind);
  const progressPct = showProgress
    ? Math.min(100, Math.max(0, (progress!.current / progress!.target) * 100))
    : 0;

  return (
    <motion.button
      type="button"
      aria-labelledby={labelId}
      aria-expanded={false}
      onClick={onExpand}
      className={`group relative flex h-full w-full flex-col items-center gap-1.5 rounded-2xl px-1.5 pb-2 pt-2.5 text-center transition duration-200 active:scale-[0.97] ${
        locked
          ? 'bg-gray-50/80 dark:bg-white/[0.03]'
          : 'bg-gradient-to-b from-white to-gray-50 shadow-sm ring-1 ring-black/[0.04] dark:from-white/[0.07] dark:to-white/[0.02] dark:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)] dark:ring-white/[0.06]'
      }`}
      whileHover={reduceMotion ? undefined : 'hover'}
      initial="rest"
      animate="rest"
    >
      <div
        className="relative mx-auto"
        style={{ width: `${box.widthRem}rem`, height: `${box.heightRem}rem` }}
      >
        {layers.map((entry, index) => {
          const isTop = index === layers.length - 1;
          const layer = pileLayerStyle(index, layers.length);
          const rest = {
            x: `${layer.xRem}rem`,
            y: `${layer.yRem}rem`,
            rotate: layer.rotate,
            scale: layer.scale,
          };
          return (
            <motion.div
              key={entry.definition.id}
              className="absolute left-1/2 top-1/2"
              style={{ zIndex: layer.zIndex }}
              variants={
                reduceMotion
                  ? undefined
                  : {
                      rest,
                      hover: {
                        x: `${layer.xRem * 1.35}rem`,
                        y: `${layer.yRem * 1.15 - (isTop ? 0.15 : 0)}rem`,
                        rotate: layer.rotate * 1.25,
                        scale: layer.scale + (isTop ? 0.02 : 0),
                      },
                    }
              }
              initial={false}
              animate={reduceMotion ? rest : undefined}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 460, damping: 28 }
              }
            >
              <div className="-translate-x-1/2 -translate-y-1/2">
                {!locked && isTop && (
                  <div
                    className={`pointer-events-none absolute inset-0 -m-1 rounded-full bg-gradient-to-b opacity-75 blur-md ${rarityAuraClass(entry.definition.rarity)}`}
                    aria-hidden
                  />
                )}
                <TrophyRarityFrame
                  rarity={entry.definition.rarity}
                  locked={locked}
                  className={`relative h-[4.5rem] w-[4.5rem] rounded-2xl shadow-[0_6px_14px_-6px_rgba(0,0,0,0.45)] ${
                    !isTop ? 'opacity-[0.92]' : ''
                  }`}
                >
                  <TrophyArt
                    artKey={entry.definition.artKey}
                    locked={locked}
                    className="h-12 w-14"
                  />
                </TrophyRarityFrame>
              </div>
            </motion.div>
          );
        })}

        <span className="absolute -right-1 -top-1 z-30 rounded-full bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white shadow-sm ring-2 ring-white dark:bg-white dark:text-gray-900 dark:ring-gray-950">
          {entries.length}
        </span>
        {hasPinned && (
          <span
            className="absolute -left-1 -top-1 z-30 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[9px] font-black text-white shadow-sm ring-2 ring-white dark:ring-gray-950"
            aria-label={t('trophies.detail.pinnedBadge')}
          >
            ✦
          </span>
        )}
      </div>

      <div className="flex w-full flex-col items-center gap-0.5 px-0.5">
        <span
          id={labelId}
          className={`line-clamp-1 w-full text-[11px] font-semibold leading-tight ${rarityTextClass(top.definition.rarity, locked)}`}
        >
          {t(familyKey)}
        </span>
        <span className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">
          <span className="line-clamp-1 tabular-nums">{t(top.definition.titleKey)}</span>
          <motion.span
            className="inline-block shrink-0 text-[9px] opacity-70"
            variants={reduceMotion ? undefined : { rest: { y: 0 }, hover: { y: 1 } }}
            aria-hidden
          >
            ▾
          </motion.span>
        </span>
      </div>

      <div className="mt-auto w-full min-h-[0.875rem] px-1">
        {showProgress && (
          <div className="h-1 overflow-hidden rounded-full bg-gray-200/90 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-primary-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>
    </motion.button>
  );
}
