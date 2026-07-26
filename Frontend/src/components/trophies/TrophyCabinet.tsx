import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getHorizontalScrollFadeMaskStyle } from '@/components/HorizontalScrollFadeEdges';
import { groupCabinetRailItems } from '@/components/trophies/cabinetGrouping';
import { TrophyCabinetCard } from '@/components/trophies/TrophyCabinetCard';
import { TrophyCabinetStack } from '@/components/trophies/TrophyCabinetStack';
import { useTrophyStackExpansion } from '@/components/trophies/useTrophyStackExpansion';
import { useHorizontalScrollFade } from '@/hooks/useHorizontalScrollFade';
import type { TrophiesPayload, TrophyCabinetEntryView } from '@/types/trophies';

type TrophyCabinetProps = {
  trophies: TrophiesPayload | null | undefined;
  isOwn: boolean;
  ownerUserId?: string;
};

export function TrophyCabinet({ trophies, isOwn, ownerUserId }: TrophyCabinetProps) {
  const { t } = useTranslation();
  const pinnedIds = useMemo(
    () => new Set(trophies?.pinnedInstanceIds ?? []),
    [trophies?.pinnedInstanceIds],
  );

  if (!trophies) return null;

  const { cabinet, unlockedCount, pinsEditable } = trophies;
  const visitorEmpty = !isOwn && unlockedCount === 0;

  if (visitorEmpty) {
    return (
      <section className="flex items-baseline gap-2 rounded-2xl border border-gray-100/80 bg-gradient-to-b from-gray-50 via-white to-white px-4 py-4 dark:border-gray-700/50 dark:from-gray-800/40 dark:via-gray-900/30 dark:to-gray-900/20">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
          {t('trophies.cabinet.title')}
        </h3>
        <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {t('trophies.cabinet.visitorEmpty')}
        </p>
      </section>
    );
  }

  if (cabinet.length === 0) return null;

  return (
    <TrophyCabinetRail
      cabinet={cabinet}
      unlockedCount={unlockedCount}
      isOwn={isOwn}
      pinsEditable={pinsEditable}
      pinnedIds={pinnedIds}
      ownerUserId={ownerUserId}
    />
  );
}

function TrophyCabinetRail({
  cabinet,
  unlockedCount,
  isOwn,
  pinsEditable,
  pinnedIds,
  ownerUserId,
}: {
  cabinet: TrophyCabinetEntryView[];
  unlockedCount: number;
  isOwn: boolean;
  pinsEditable: boolean;
  pinnedIds: ReadonlySet<string>;
  ownerUserId?: string;
}) {
  const { t } = useTranslation();
  const carouselRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => groupCabinetRailItems(cabinet), [cabinet]);
  const stackKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of rows) {
      if (item.kind === 'stack') keys.add(item.key);
    }
    return keys;
  }, [rows]);
  const { showLeftFade, showRightFade } = useHorizontalScrollFade(carouselRef, rows.length);
  const maskStyle = getHorizontalScrollFadeMaskStyle(showLeftFade, showRightFade);
  const { isExpanded, setExpanded } = useTrophyStackExpansion(stackKeys);

  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
          {t('trophies.cabinet.title')}
        </h3>
        {unlockedCount > 0 && (
          <span className="rounded-full bg-gray-100/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {t('trophies.cabinet.count', { count: unlockedCount })}
          </span>
        )}
      </div>

      <motion.div
        ref={carouselRef}
        style={maskStyle}
        className="-mx-1 flex gap-2.5 overflow-x-auto px-1 py-3 scrollbar-hide [touch-action:pan-x_pan-y] overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch]"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
        }}
      >
        {rows.map((item) =>
          item.kind === 'card' ? (
            <motion.div
              key={item.key}
              className="w-[6.75rem] shrink-0 snap-start"
              variants={{
                hidden: { opacity: 0, x: 14 },
                visible: { opacity: 1, x: 0 },
              }}
            >
              <TrophyCabinetCard
                entry={item.entry}
                isOwn={isOwn}
                pinsEditable={pinsEditable}
                pinnedInstanceIds={pinnedIds}
                ownerUserId={ownerUserId}
              />
            </motion.div>
          ) : (
            <motion.div
              key={item.key}
              className="shrink-0 snap-start"
              variants={{
                hidden: { opacity: 0, x: 14 },
                visible: { opacity: 1, x: 0 },
              }}
            >
              <TrophyCabinetStack
                entries={item.entries}
                unlocked={item.unlocked}
                isOwn={isOwn}
                pinsEditable={pinsEditable}
                pinnedInstanceIds={pinnedIds}
                ownerUserId={ownerUserId}
                expanded={isExpanded(item.key)}
                onExpandedChange={(next) => setExpanded(item.key, next)}
              />
            </motion.div>
          ),
        )}
      </motion.div>
    </section>
  );
}
