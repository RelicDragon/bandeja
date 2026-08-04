import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyDetailSheet } from '@/components/trophies/TrophyDetailSheet';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import type { TrophyShowcaseSlotView, TrophiesPayload } from '@/types/trophies';

type TrophyShowcaseProps = {
  trophies: TrophiesPayload | null | undefined;
  isOwn?: boolean;
  ownerUserId?: string;
  /** When true, use light-surface styling (Profile Statistics hero). */
  onLight?: boolean;
  className?: string;
};

export function TrophyShowcase({
  trophies,
  isOwn = false,
  ownerUserId,
  onLight = false,
  className = '',
}: TrophyShowcaseProps) {
  const { t } = useTranslation();
  if (!trophies) return null;

  const slots = trophies.showcase;
  const filled = slots.filter((s) => s.instance);
  const hasAny = filled.length > 0;
  const visitorEmpty = !isOwn && !hasAny;

  if (visitorEmpty) return null;

  const visibleSlots = isOwn ? slots : filled;
  const pinnedIds = new Set(trophies.pinnedInstanceIds ?? []);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        {visibleSlots.map((slot, index) => (
          <ShowcaseSlot
            key={slot.slot}
            slot={slot}
            isOwn={isOwn}
            index={index}
            onLight={onLight}
            pinsEditable={trophies.pinsEditable}
            pinnedInstanceIds={pinnedIds}
            ownerUserId={ownerUserId}
          />
        ))}
      </div>
      {isOwn && !hasAny && (
        <p
          className={`text-[10px] font-medium leading-snug ${
            onLight ? 'text-white/85' : 'text-white/80'
          }`}
        >
          {t('trophies.showcase.hint')}
        </p>
      )}
      {isOwn && hasAny && filled.length < 3 && trophies.pinsEditable && (
        <p
          className={`text-[10px] font-medium leading-snug ${
            onLight ? 'text-white/70' : 'text-white/65'
          }`}
        >
          {t('trophies.showcase.pinHint')}
        </p>
      )}
    </div>
  );
}

function ShowcaseSlot({
  slot,
  isOwn,
  index,
  onLight,
  pinsEditable,
  pinnedInstanceIds,
  ownerUserId,
}: {
  slot: TrophyShowcaseSlotView;
  isOwn: boolean;
  index: number;
  onLight: boolean;
  pinsEditable: boolean;
  pinnedInstanceIds: ReadonlySet<string>;
  ownerUserId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unlocked = Boolean(slot.instance && slot.definition);
  const contentKey = slot.instance?.id ?? `empty-${slot.slot}`;

  const instancesList =
    slot.instances && slot.instances.length > 0
      ? slot.instances
      : slot.instance
      ? [slot.instance]
      : [];

  const showEarnedCount =
    unlocked &&
    slot.definition != null &&
    instancesList.length > 0 &&
    (slot.definition.type === 'REPEATABLE' || instancesList.length > 1);

  return (
    <>
      <div className="relative h-12 w-12">
        <AnimatePresence mode="popLayout" initial={false}>
          {!unlocked ? (
            <motion.div
              key={contentKey}
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className={`absolute inset-0 flex items-center justify-center rounded-2xl border border-dashed backdrop-blur-[2px] ${
                onLight
                  ? 'border-white/35 bg-white/15'
                  : 'border-white/30 bg-white/10'
              }`}
              aria-label={t('trophies.showcase.emptySlot')}
            >
              <span
                className="block h-2.5 w-2.5 rotate-45 rounded-[1px] border border-white/45 bg-white/20"
                aria-hidden
              />
            </motion.div>
          ) : (
            <motion.button
              key={contentKey}
              type="button"
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26, delay: index * 0.04 }}
              whileTap={{ scale: 0.93 }}
              onClick={() => setOpen(true)}
              className="absolute inset-0"
              aria-label={t(slot.definition!.titleKey)}
            >
              <TrophyRarityFrame
                rarity={slot.definition!.rarity}
                className="h-12 w-12"
              >
                <TrophyArt artKey={slot.definition!.artKey} className="h-8 w-9" />
              </TrophyRarityFrame>
              {showEarnedCount && (
                <span
                  data-testid="showcase-earned-count"
                  className="absolute -right-1 -top-1.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-900 px-1 text-[9px] font-bold text-white shadow-sm ring-1 ring-black/10 dark:bg-white dark:text-gray-900"
                >
                  ×{instancesList.length}
                </span>
              )}
              {isOwn && slot.pinned && (
                <span
                  className="absolute -bottom-1.5 left-1/2 flex h-3.5 min-w-3.5 -translate-x-1/2 items-center justify-center rounded-full bg-white px-0.5 text-[8px] font-black text-primary-700 shadow-sm ring-1 ring-black/10"
                  aria-hidden
                >
                  ★
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {unlocked && slot.definition && slot.instance && (
        <TrophyDetailSheet
          open={open}
          onOpenChange={setOpen}
          definition={slot.definition}
          instance={slot.instance}
          instances={instancesList}
          locked={false}
          progress={null}
          isOwn={isOwn}
          pinsEditable={pinsEditable}
          pinnedInstanceIds={pinnedInstanceIds}
          ownerUserId={ownerUserId}
        />
      )}
    </>
  );
}
