/**
 * Bottom sheet for one court slot: "Any court" or a specific court, with each
 * court's availability for the chosen time when there is one. Hard-blocked
 * courts cannot be picked (except a court the organizer says they reserved —
 * their own booking is what shows as busy). A linked slot shows its
 * reservation and can drop it.
 */
import type { ReactNode } from 'react';
import { Check, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Court } from '@/types';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import type { AtClubChoice, CourtPlanSlot, CourtWindowState } from './courtPlanModel';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: number | null;
  slots: readonly CourtPlanSlot[];
  courts: readonly Court[];
  choice: AtClubChoice | null;
  /** Court states over the chosen game window; null until a time is picked. */
  states: ReadonlyMap<string, CourtWindowState> | null;
  bookableCourtIds: ReadonlySet<string>;
  /** Label of the reservation linked to this slot (time range). */
  linkedLabel?: string | null;
  onPick: (courtId: string | null) => void;
  onReportedChange: (reported: boolean) => void;
  onRemoveReservation: () => void;
};

type CourtStatus = { label: string; tone: 'free' | 'soft' | 'hard' | 'muted'; disabled: boolean };

export function CourtPickerSheet({
  open,
  onOpenChange,
  index,
  slots,
  courts,
  choice,
  states,
  bookableCourtIds,
  linkedLabel,
  onPick,
  onReportedChange,
  onRemoveReservation,
}: Props) {
  const { t } = useTranslation();
  useBackButtonModal(open, () => onOpenChange(false), 'create-court-picker');
  const slot = index != null ? slots[index] : undefined;
  const title = t('createGame.courtPlan.slotLabel', { n: (index ?? 0) + 1 });
  const reported = choice === 'alreadyReserved' && Boolean(slot?.reported);

  const statusOf = (court: Court): CourtStatus | null => {
    const otherSlot = slots.findIndex((s, i) => i !== index && s.courtId === court.id);
    if (otherSlot >= 0 && slots[otherSlot].bookingId) {
      return { label: t('createGame.courtPlan.sheet.linkedElsewhere'), tone: 'muted', disabled: true };
    }
    if (choice === 'reserveNow' && !bookableCourtIds.has(court.id)) {
      return { label: t('createGame.courtPlan.sheet.notBookable'), tone: 'hard', disabled: true };
    }
    const state = states?.get(court.id);
    if (state?.hard && !reported) {
      const key =
        state.hard === 'hold'
          ? 'createGame.courtPlan.sheet.hold'
          : state.hard === 'app_game_reserved'
            ? 'createGame.courtPlan.sheet.reservedGame'
            : 'createGame.courtPlan.sheet.club';
      return { label: t(key), tone: 'hard', disabled: true };
    }
    if (otherSlot >= 0) {
      return { label: t('createGame.courtPlan.sheet.onSlot', { n: otherSlot + 1 }), tone: 'muted', disabled: false };
    }
    if (state?.soft) return { label: t('createGame.courtPlan.sheet.plannedGame'), tone: 'soft', disabled: false };
    if (states) return { label: t('createGame.courtPlan.sheet.free'), tone: 'free', disabled: false };
    return null;
  };

  const toneClass: Record<CourtStatus['tone'], string> = {
    free: 'text-emerald-700 dark:text-emerald-300',
    soft: 'text-amber-700 dark:text-amber-300',
    hard: 'text-gray-400 dark:text-gray-500',
    muted: 'text-gray-500 dark:text-gray-400',
  };

  const option = (
    key: string,
    selected: boolean,
    disabled: boolean,
    onSelect: () => void,
    label: ReactNode,
    status: CourtStatus | null,
  ) => (
    <li key={key}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 py-2 text-start transition-colors motion-reduce:transition-none ${
          selected
            ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-950/40'
            : 'border-gray-200 bg-white hover:border-primary-200 dark:border-gray-700 dark:bg-gray-900'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{label}</span>
          {status ? <span className={`block text-xs ${toneClass[status.tone]}`}>{status.label}</span> : null}
        </span>
        {selected ? <Check size={18} className="shrink-0 text-primary-600 dark:text-primary-300" aria-hidden /> : null}
      </button>
    </li>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent accessibleTitle={title} className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto">
          <DrawerHeader className="px-0 text-start">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              {slot?.bookingId
                ? t('createGame.courtPlan.sheet.linkedHint')
                : states
                  ? t('createGame.courtPlan.sheet.hint')
                  : t('createGame.courtPlan.sheet.noTime')}
            </DrawerDescription>
          </DrawerHeader>

          {slot?.bookingId ? (
            <div className="space-y-3 pb-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-100">
                <p className="font-medium">
                  {(() => {
                    const court = courts.find((c) => c.id === slot.courtId);
                    return court ? (
                      <CourtDisplayName name={court.name} integrationName={court.integrationCourtName} />
                    ) : (
                      t('createGame.courtPlan.anyCourt')
                    );
                  })()}
                </p>
                {linkedLabel ? <p className="mt-0.5 tabular-nums">{linkedLabel}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemoveReservation();
                  onOpenChange(false);
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Unlink size={16} aria-hidden />
                {t('createGame.courtPlan.sheet.removeReservation')}
              </button>
            </div>
          ) : (
            <>
              {choice === 'alreadyReserved' && slot ? (
                <div className="mb-3 flex min-h-[48px] items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 dark:bg-gray-900/60">
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    {t('createGame.courtPlan.sheet.reservedToggle')}
                  </span>
                  <ToggleSwitch checked={slot.reported} onChange={onReportedChange} />
                </div>
              ) : null}
              <ul className="space-y-2 pb-2" role="radiogroup" aria-label={title}>
                {option(
                  'any',
                  slot?.courtId == null,
                  false,
                  () => {
                    onPick(null);
                    onOpenChange(false);
                  },
                  t('createGame.courtPlan.anyCourt'),
                  {
                    label:
                      choice === 'reserveNow'
                        ? t('createGame.courtPlan.sheet.anyReserveHint')
                        : t('createGame.courtPlan.sheet.anyHint'),
                    tone: 'muted',
                    disabled: false,
                  },
                )}
                {courts.map((court) => {
                  const status = statusOf(court);
                  const selected = slot?.courtId === court.id;
                  return option(
                    court.id,
                    selected,
                    Boolean(status?.disabled) && !selected,
                    () => {
                      onPick(court.id);
                      onOpenChange(false);
                    },
                    <CourtDisplayName name={court.name} integrationName={court.integrationCourtName} />,
                    status,
                  );
                })}
              </ul>
            </>
          )}
        </OverlayKeyboardBody>
      </DrawerContent>
    </Drawer>
  );
}
