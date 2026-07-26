import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyCabinetCard } from '@/components/trophies/TrophyCabinetCard';
import { TrophyCabinetPile } from '@/components/trophies/TrophyCabinetPile';
import {
  STACK_CARD_WIDTH_REM,
  scrollChildIntoHorizontalView,
  stackExpandedWidthRem,
  stackFamilyLabelKey,
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
  const locked = !unlocked;

  useEffect(() => {
    if (!expanded) return;
    const node = rootRef.current;
    if (!node) return;

    const scroll = () => scrollChildIntoHorizontalView(node);
    const raf = window.requestAnimationFrame(scroll);
    // Width spring needs a beat before the final edge is trustworthy.
    const delayMs = reduceMotion ? 0 : 300;
    const timer = window.setTimeout(scroll, delayMs);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [expanded, reduceMotion, entries.length]);

  if (entries.length < 2) return null;

  const top = entries[entries.length - 1]!;
  const hasPinned = entries.some((e) =>
    e.instances.some((i) => pinnedInstanceIds.has(i.id)),
  );
  const familyKey = stackFamilyLabelKey(top.definition.ruleKind);
  const expandedWidthRem = stackExpandedWidthRem(entries.length);
  const widthTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 360, damping: 34, mass: 0.85 };

  return (
    <motion.div
      ref={rootRef}
      className="relative shrink-0"
      animate={{
        width: expanded ? `${expandedWidthRem}rem` : `${STACK_CARD_WIDTH_REM}rem`,
      }}
      transition={widthTransition}
    >
      <AnimatePresence initial={false} mode="sync">
        {expanded ? (
          <motion.div
            key="expanded"
            className="flex flex-col gap-1.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
          >
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {t(familyKey)}
              </span>
              <button
                type="button"
                onClick={() => onExpandedChange(false)}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100/95 px-2 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-black/[0.04] transition hover:bg-gray-200/90 active:scale-95 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/15"
                aria-label={t('trophies.cabinet.collapseStack')}
              >
                {t('trophies.cabinet.collapse')}
                <span aria-hidden>▴</span>
              </button>
            </div>

            <div className="flex gap-2.5">
              {entries.map((entry, index) => (
                <motion.div
                  key={entry.definition.id}
                  className="w-[6.75rem] shrink-0"
                  initial={
                    reduceMotion
                      ? false
                      : {
                          opacity: 0,
                          x: (index - (entries.length - 1) / 2) * -10,
                          y: 8,
                          scale: 0.88,
                          rotate: (index - (entries.length - 1) / 2) * -4,
                        }
                  }
                  animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
                  exit={
                    reduceMotion
                      ? undefined
                      : {
                          opacity: 0,
                          y: 6,
                          scale: 0.92,
                          transition: { duration: 0.12 },
                        }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          stiffness: 440,
                          damping: 28,
                          delay: index * 0.04,
                        }
                  }
                >
                  <TrophyCabinetCard
                    entry={entry}
                    isOwn={isOwn}
                    pinsEditable={pinsEditable}
                    pinnedInstanceIds={pinnedInstanceIds}
                    ownerUserId={ownerUserId}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={reduceMotion ? false : { opacity: 0.85, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 400, damping: 30 }
            }
          >
            <TrophyCabinetPile
              entries={entries}
              locked={locked}
              hasPinned={hasPinned}
              labelId={labelId}
              isOwn={isOwn}
              reduceMotion={Boolean(reduceMotion)}
              onExpand={() => onExpandedChange(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
