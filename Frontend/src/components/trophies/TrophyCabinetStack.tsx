import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyCabinetCard } from '@/components/trophies/TrophyCabinetCard';
import { TrophyCabinetPile } from '@/components/trophies/TrophyCabinetPile';
import {
  STACK_CARD_WIDTH_REM,
  scrollChildIntoHorizontalView,
  stackExpandedWidthRem,
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
    const delayMs = reduceMotion ? 0 : 300;
    const timer = window.setTimeout(scroll, delayMs);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [expanded, reduceMotion, entries.length]);

  if (entries.length < 2) return null;

  const hasPinned = entries.some((e) =>
    e.instances.some((i) => pinnedInstanceIds.has(i.id)),
  );
  const expandedWidthRem = stackExpandedWidthRem(entries.length);
  const widthTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 36, mass: 0.8 };

  return (
    <motion.div
      ref={rootRef}
      className="relative h-full shrink-0 overflow-hidden"
      animate={{
        width: expanded ? `${expandedWidthRem}rem` : `${STACK_CARD_WIDTH_REM}rem`,
      }}
      transition={widthTransition}
    >
      <AnimatePresence initial={false} mode="sync">
        {expanded ? (
          <motion.div
            key="expanded"
            className="flex h-full flex-nowrap items-stretch gap-2.5"
            initial={reduceMotion ? false : { opacity: 0.4 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            {entries.map((entry, index) => (
              <motion.div
                key={entry.definition.id}
                className="w-[6.75rem] shrink-0"
                initial={
                  reduceMotion
                    ? false
                    : {
                        opacity: 0,
                        x: -12 - index * 6,
                        scale: 0.92,
                      }
                }
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={
                  reduceMotion
                    ? undefined
                    : {
                        opacity: 0,
                        x: -8 - index * 4,
                        scale: 0.94,
                        transition: { duration: 0.14 },
                      }
                }
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        type: 'spring',
                        stiffness: 420,
                        damping: 30,
                        delay: index * 0.035,
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
            <motion.button
              type="button"
              onClick={() => onExpandedChange(false)}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 420, damping: 28, delay: 0.08 }
              }
              className="flex w-7 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-2xl bg-gray-100/95 text-gray-500 ring-1 ring-black/[0.04] transition hover:bg-gray-200/90 hover:text-gray-700 active:scale-95 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10 dark:hover:bg-white/15 dark:hover:text-white"
              aria-label={t('trophies.cabinet.collapseStack')}
              title={t('trophies.cabinet.collapse')}
            >
              <span className="text-sm leading-none" aria-hidden>
                ‹
              </span>
              <span className="text-[9px] font-bold tabular-nums leading-none">
                {entries.length}
              </span>
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            className="h-full w-full"
            initial={reduceMotion ? false : { opacity: 0.85, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 400, damping: 32 }
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
