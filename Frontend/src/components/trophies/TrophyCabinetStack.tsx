import { useEffect, useId, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyStackIcon } from '@/components/trophies/TrophyStackIcon';
import {
  TROPHY_RARITY_TAG_CLASS,
  TROPHY_TILE_LABEL_SLOT_CLASS,
  trophyGroupFrameClass,
} from '@/components/trophies/trophyCabinetTileChrome';
import {
  rarityBadgeClass,
  rarityLabelKey,
  rarityTextClass,
  showsRarityTag,
} from '@/components/trophies/trophyRarityStyles';
import { isMaxLevelEntry, nextChaseEntry } from '@/components/trophies/cabinetGrouping';
import {
  trophyFrameLocked,
  trophyMaxLevelDisplayRarity,
  trophyProgressFillClass,
} from '@/components/trophies/trophyProgressStyles';
import {
  STACK_CARD_GAP_REM,
  STACK_CARD_WIDTH_REM,
  STACK_COLLAPSE_CHIP_REM,
  STACK_FRAME_PADDING_REM,
  STACK_ICON_CELL_REM,
  STACK_LABEL_WIDTH_REM,
  pileLayerStyle,
  scrollChildIntoHorizontalView,
  selectFamilyPileLayers,
  stackExpandedWidthRem,
  stackFamilyLabelKey,
  stackPileFace,
} from '@/components/trophies/trophyStackGeometry';
import type { TrophyCabinetEntryView } from '@/types/trophies';

type TrophyCabinetStackProps = {
  entries: TrophyCabinetEntryView[];
  unlocked: boolean;
  isOwn: boolean;
  pinsEditable: boolean;
  pinnedInstanceIds: ReadonlySet<string>;
  ownerUserId?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const spring = { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.65 };

const COLLAPSED_ICON_X_REM = (STACK_CARD_WIDTH_REM - STACK_ICON_CELL_REM) / 2;
const ICON_TOP_REM = 0.625;
const COLLAPSED_LABEL_TOP_REM = 6;

/** One frame and one icon tree animate between pile and row geometry. */
export function TrophyCabinetStack({
  entries,
  unlocked,
  isOwn,
  pinsEditable,
  pinnedInstanceIds,
  ownerUserId,
  expanded,
  onExpandedChange,
}: TrophyCabinetStackProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const frameLocked = !unlocked;

  useEffect(() => {
    if (!expanded) return;
    const node = rootRef.current;
    if (!node) return;
    const scroll = () => scrollChildIntoHorizontalView(node);
    const timer = window.setTimeout(scroll, reduceMotion ? 0 : 460);
    return () => {
      window.clearTimeout(timer);
    };
  }, [expanded, reduceMotion, entries.length]);

  const pilePaint = useMemo(() => selectFamilyPileLayers(entries), [entries]);
  const pileIndexById = useMemo(() => {
    const map = new Map<string, number>();
    pilePaint.forEach((e, i) => map.set(e.definition.id, i));
    return map;
  }, [pilePaint]);

  if (entries.length < 2) return null;

  const nextChase = nextChaseEntry(entries);
  const top = stackPileFace(entries) ?? entries[0]!;
  const hasPinned = entries.some((e) =>
    e.instances.some((i) => pinnedInstanceIds.has(i.id)),
  );
  const familyKey = stackFamilyLabelKey(top.definition.ruleKind);
  const progress = nextChase?.progress ?? null;
  const chaseIsMaxLevel =
    nextChase != null && isMaxLevelEntry(nextChase, entries);
  const showProgress =
    isOwn &&
    progress != null &&
    progress.target > 0 &&
    Number.isFinite(progress.current) &&
    Number.isFinite(progress.target);
  const progressPct = showProgress
    ? Math.min(100, Math.max(0, (progress!.current / progress!.target) * 100))
    : 0;
  const faceDisplayRarity = trophyMaxLevelDisplayRarity(
    chaseIsMaxLevel,
    top.unlocked,
    top.definition.rarity,
  );
  const faceFrameLocked = trophyFrameLocked(!top.unlocked);

  const targetWidthRem = expanded
    ? stackExpandedWidthRem(entries.length)
    : STACK_CARD_WIDTH_REM;

  return (
    <motion.div
      ref={rootRef}
      className="relative flex shrink-0 self-stretch"
      initial={false}
      animate={{ width: `${targetWidthRem}rem` }}
      transition={reduceMotion ? { duration: 0 } : spring}
    >
      <div
        data-testid="trophy-stack-frame"
        data-state={expanded ? 'expanded' : 'collapsed'}
        className={trophyGroupFrameClass(frameLocked)}
        onClick={(event) => {
          if (
            expanded &&
            event.target instanceof Node &&
            event.currentTarget.contains(event.target)
          ) {
            onExpandedChange(false);
          }
        }}
      >
        <div
          data-testid="trophy-stack-height-probe"
          className="pointer-events-none invisible flex flex-col items-center pb-6 pt-2.5"
          style={{ width: `${STACK_LABEL_WIDTH_REM}rem` }}
          aria-hidden
        >
          <div className="h-[4.5rem] w-full shrink-0" />
          <div className="mt-2 grid w-full grid-cols-1 px-0.5">
            {entries.map((entry) => {
              const entryMax = isMaxLevelEntry(entry, entries);
              const displayRarity = trophyMaxLevelDisplayRarity(
                entryMax,
                entry.unlocked,
                entry.definition.rarity,
              );
              const entryFrameLocked = trophyFrameLocked(!entry.unlocked);
              return (
              <div
                key={entry.definition.id}
                className="col-start-1 row-start-1 flex w-full flex-col items-center"
              >
                <div className={TROPHY_TILE_LABEL_SLOT_CLASS}>
                  <span className="line-clamp-2 w-full break-words text-[11px] font-semibold leading-tight">
                    {t(entry.definition.titleKey)}
                  </span>
                </div>
                {showsRarityTag(entry.definition.rarity) && (
                  <span
                    className={`mt-1 ${TROPHY_RARITY_TAG_CLASS} ${rarityBadgeClass(displayRarity, entryFrameLocked)}`}
                  >
                    {t(rarityLabelKey(entry.definition.rarity))}
                  </span>
                )}
              </div>
              );
            })}
          </div>
        </div>

        {entries.map((entry, index) => {
          const entryLocked = !entry.unlocked;
          const pileIndex = pileIndexById.get(entry.definition.id);
          const layer =
            pileIndex == null ? null : pileLayerStyle(pileIndex, pilePaint.length);
          const expandedX =
            STACK_FRAME_PADDING_REM + index * (STACK_ICON_CELL_REM + STACK_CARD_GAP_REM);
          const collapsedX = COLLAPSED_ICON_X_REM + (layer?.xRem ?? 0);
          const collapsedY = ICON_TOP_REM + (layer?.yRem ?? 0);

          return (
            <motion.div
              key={entry.definition.id}
              data-stack-entry={entry.definition.id}
              className="absolute left-0 top-0"
              style={{
                width: `${STACK_ICON_CELL_REM}rem`,
                zIndex: expanded ? 10 : (layer?.zIndex ?? 0),
              }}
              initial={false}
              animate={{
                x: `${expanded ? expandedX : collapsedX}rem`,
                y: `${expanded ? ICON_TOP_REM : collapsedY}rem`,
                rotate: expanded ? 0 : (layer?.rotate ?? 0),
                scale: expanded ? 1 : (layer?.scale ?? 0.88),
                opacity: expanded || layer != null ? 1 : 0,
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      ...spring,
                      delay: expanded
                        ? index * 0.035
                        : Math.max(0, entries.length - index - 1) * 0.018,
                    }
              }
            >
              <TrophyStackIcon
                entry={entry}
                locked={entryLocked}
                maxLevel={isMaxLevelEntry(entry, entries)}
                labelVisible={expanded}
                interactive={expanded}
                isOwn={isOwn}
                pinsEditable={pinsEditable}
                pinnedInstanceIds={pinnedInstanceIds}
                ownerUserId={ownerUserId}
                openDetailOnClick={expanded}
              />
            </motion.div>
          );
        })}

        <button
          type="button"
          data-testid="trophy-stack-toggle"
          aria-labelledby={labelId}
          aria-expanded={expanded}
          aria-hidden={expanded}
          disabled={expanded}
          onClick={() => onExpandedChange(true)}
          className={`absolute inset-0 z-40 rounded-2xl outline-none transition hover:bg-black/[0.015] focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.985] dark:hover:bg-white/[0.025] ${
            expanded ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        />

        <motion.div
          data-testid="trophy-stack-collapsed-label"
          className="pointer-events-none absolute inset-x-1.5 z-30 flex flex-col items-center justify-center gap-0.5 px-0.5"
          style={{ top: `${COLLAPSED_LABEL_TOP_REM}rem` }}
          initial={false}
          animate={{
            opacity: expanded ? 0 : 1,
            y: expanded ? 5 : 0,
          }}
          transition={{ duration: reduceMotion ? 0 : expanded ? 0.12 : 0.2 }}
          aria-hidden={expanded}
        >
          <span
            id={labelId}
            className={`flex w-full items-center justify-center gap-0.5 text-[11px] font-semibold leading-tight ${rarityTextClass(faceDisplayRarity, faceFrameLocked)}`}
          >
            <span className="line-clamp-1">{t(familyKey)}</span>
            <span className="shrink-0 text-[9px] opacity-70" aria-hidden>
              ▾
            </span>
          </span>
          <span
            data-testid="trophy-stack-collapsed-subtitle"
            className="line-clamp-2 w-full break-words text-[10px] font-medium leading-[1.15] text-gray-400 dark:text-gray-500"
          >
            {t(top.definition.titleKey)}
          </span>
        </motion.div>

        <motion.div
          data-testid="trophy-stack-count"
          className="pointer-events-none absolute right-1 top-1 z-30"
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.14 }}
          aria-hidden
        >
          <span className="rounded-full bg-gray-900 px-1.5 text-[10px] font-bold tabular-nums text-white dark:bg-white dark:text-gray-900">
            ×{entries.length}
          </span>
        </motion.div>

        {hasPinned && (
          <motion.div
            className="pointer-events-none absolute left-1 top-1 z-30"
            initial={false}
            animate={{
              opacity: expanded ? 0 : 1,
              scale: expanded ? 0.85 : 1,
            }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
            aria-hidden={expanded}
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[9px] font-black text-white shadow-sm ring-2 ring-white dark:ring-gray-900"
              aria-label={t('trophies.detail.pinnedBadge')}
            >
              ✦
            </span>
          </motion.div>
        )}

        {showProgress && (
          <motion.div
            data-testid="trophy-progress"
            className="pointer-events-none absolute inset-x-2 bottom-2 z-30"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.12 }}
          >
            <div className="h-1 overflow-hidden rounded-full bg-gray-200/90 dark:bg-white/10">
              <div
                data-testid="trophy-progress-fill"
                data-max-level={chaseIsMaxLevel ? 'true' : 'false'}
                className={`h-full rounded-full ${trophyProgressFillClass(chaseIsMaxLevel)}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </motion.div>
        )}

        <button
          type="button"
          onClick={() => onExpandedChange(false)}
          disabled={!expanded}
          aria-hidden={!expanded}
          className={`absolute right-2 top-1/2 z-40 flex h-7 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100/95 text-gray-500 shadow-sm ring-1 ring-black/[0.06] outline-none transition hover:bg-gray-200 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-primary-500 active:scale-95 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/15 dark:hover:text-white ${
            expanded ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ width: `${STACK_COLLAPSE_CHIP_REM}rem` }}
          aria-label={t('trophies.cabinet.collapseStack')}
          title={t('trophies.cabinet.collapse')}
        >
          <span className="-translate-x-px text-lg font-medium leading-none" aria-hidden>
            ‹
          </span>
        </button>
      </div>
    </motion.div>
  );
}
