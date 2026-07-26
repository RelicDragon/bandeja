import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyCabinetCard } from '@/components/trophies/TrophyCabinetCard';
import type { TrophiesPayload } from '@/types/trophies';

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
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
          {t('trophies.cabinet.title')}
        </h3>
        {unlockedCount > 0 && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {t('trophies.cabinet.count', { count: unlockedCount })}
          </span>
        )}
      </div>

      {isOwn && unlockedCount === 0 && (
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {t('trophies.cabinet.ownEmpty')}
        </p>
      )}

      {isOwn && pinsEditable && unlockedCount > 0 && (
        <p className="text-xs leading-snug text-gray-500 dark:text-gray-400">
          {t('trophies.cabinet.pinHint')}
        </p>
      )}

      <motion.div
        className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.045 } },
        }}
      >
        {cabinet.map((entry) => (
          <motion.div
            key={entry.definition.id}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 },
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
