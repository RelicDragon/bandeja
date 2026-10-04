import { motion } from 'framer-motion';
import { Check, Loader2, Plus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { DemandSlot } from '@/api/playIntents';
import { demandMemberAsBasicUser, demandSlotWhen, pickDemandSlotInvitees } from './demandSlots';

type Props = {
  slots: DemandSlot[];
  todayKey: string;
  partySize: number;
  /** Viewer has no active intent: offer "I'm in" next to "Create & invite". */
  canJoin: boolean;
  joiningKey?: string | null;
  onCreate: (slot: DemandSlot) => void;
  onJoin?: (slot: DemandSlot) => void;
  className?: string;
};

const AVATARS_SHOWN = 4;

/**
 * "Who's waiting": open demand by day × part of day, one horizontally snapping
 * card per slot. Each card turns a pile of "want to play" signals into a game:
 * create it with them invited, or add yourself so the slot fills.
 */
export function DemandSlotsSection({
  slots,
  todayKey,
  partySize,
  canJoin,
  joiningKey,
  onCreate,
  onJoin,
  className,
}: Props) {
  const { t, i18n } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  if (slots.length === 0) return null;

  return (
    <section className={className} data-testid="demand-slots" aria-label={t('playIntent.slotsTitle')}>
      {/* pe-14 keeps the copy clear of the drawer's close button in compose mode. */}
      <div className="mb-2 px-4 pe-14">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('playIntent.slotsTitle')}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('playIntent.slotsHint')}</p>
      </div>
      <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slots.map((slot, index) => {
          const invitees = pickDemandSlotInvitees(slot, partySize);
          // Organizer + invitees (+ the viewer once if they are already in the slot).
          const filled = invitees.length + 1;
          const spotsLeft = Math.max(0, partySize - filled);
          const joining = joiningKey === slot.key;
          const extra = slot.count - Math.min(slot.members.length, AVATARS_SHOWN);
          return (
            <motion.article
              key={slot.key}
              data-testid="demand-slot"
              data-slot-key={slot.key}
              className="flex w-[15.5rem] shrink-0 snap-start flex-col gap-2.5 rounded-2xl border border-gray-200/80 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.055]"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduceMotion ? 0 : Math.min(index, 4) * 0.04 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-950 dark:text-white">
                    {demandSlotWhen(slot, todayKey, t, i18n.language)}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {slot.fitCount > 0
                      ? t('playIntent.slotFitCount', { count: slot.fitCount })
                      : t('playIntent.slotCount', { count: slot.count })}
                  </div>
                </div>
                {slot.viewerIn && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Check className="h-3 w-3" strokeWidth={3} />
                    {t('playIntent.slotYoureIn')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5" aria-hidden>
                  {slot.members.slice(0, AVATARS_SHOWN).map((member) => (
                    <div key={member.userId} className={member.fitsViewer ? '' : 'opacity-50'}>
                      <PlayerAvatar
                        player={demandMemberAsBasicUser(member)}
                        subscribePresence={false}
                        fullHideName
                        inlineFace
                        inlineFacePlain
                        inlineFaceFlatStack
                        asDiv
                      />
                    </div>
                  ))}
                </div>
                {extra > 0 && (
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">+{extra}</span>
                )}
                <span className="ms-auto inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  <Users className="h-3.5 w-3.5" />
                  {spotsLeft === 0
                    ? t('playIntent.slotFullWithYou')
                    : t('playIntent.slotSpotsLeft', { count: spotsLeft })}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 text-[13px] font-semibold text-white transition-transform active:scale-[0.98]"
                  onClick={() => onCreate(slot)}
                  data-testid="demand-slot-create"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} />
                  {t('playIntent.slotCreate')}
                </button>
                {canJoin && onJoin && !slot.viewerIn && (
                  <button
                    type="button"
                    className="flex h-9 items-center justify-center rounded-xl bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-700 transition-transform active:scale-[0.98] disabled:opacity-60 dark:bg-emerald-500/10 dark:text-emerald-300"
                    onClick={() => onJoin(slot)}
                    disabled={!!joiningKey}
                    data-testid="demand-slot-join"
                  >
                    {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : t('playIntent.slotJoin')}
                  </button>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
