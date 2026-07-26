import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getHorizontalScrollFadeMaskStyle } from '@/components/HorizontalScrollFadeEdges';
import { TrophyCabinetCard } from '@/components/trophies/TrophyCabinetCard';
import { useHorizontalScrollFade } from '@/hooks/useHorizontalScrollFade';
import type { TrophiesPayload, TrophyCabinetEntryView } from '@/types/trophies';

type TrophyCabinetProps = {
  trophies: TrophiesPayload | null | undefined;
  isOwn: boolean;
  ownerUserId?: string;
};

function sortCabinet(entries: TrophyCabinetEntryView[]): TrophyCabinetEntryView[] {
  return [...entries].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    if (a.unlocked && b.unlocked) {
      const aEarned = a.instances[0]?.earnedAt ? Date.parse(a.instances[0].earnedAt) : 0;
      const bEarned = b.instances[0]?.earnedAt ? Date.parse(b.instances[0].earnedAt) : 0;
      return bEarned - aEarned;
    }
    const aProg = a.progress && a.progress.target > 0 ? a.progress.current / a.progress.target : 0;
    const bProg = b.progress && b.progress.target > 0 ? b.progress.current / b.progress.target : 0;
    return bProg - aProg;
  });
}

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
  const rows = useMemo(() => sortCabinet(cabinet), [cabinet]);
  const { showLeftFade, showRightFade } = useHorizontalScrollFade(carouselRef, rows.length);
  const maskStyle = getHorizontalScrollFadeMaskStyle(showLeftFade, showRightFade);

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
        className="-mx-1 flex gap-2.5 overflow-x-auto overflow-y-hidden px-1 pb-1 scrollbar-hide [touch-action:pan-x_pan-y] overscroll-x-contain snap-x snap-mandatory [-webkit-overflow-scrolling:touch]"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
        }}
      >
        {rows.map((entry) => (
          <motion.div
            key={entry.definition.id}
            className="w-[6.75rem] shrink-0 snap-start"
            variants={{
              hidden: { opacity: 0, x: 14 },
              visible: { opacity: 1, x: 0 },
            }}
          >
            <TrophyCabinetCard
              entry={entry}
              isOwn={isOwn}
              pinsEditable={pinsEditable}
              pinnedInstanceIds={pinnedIds}
              ownerUserId={ownerUserId}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
