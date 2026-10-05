/**
 * "Courts − N +" and one chip per court slot ("Any court" or a picked court).
 * A chip opens the court picker sheet. Reserved slots carry a small tick.
 * Entrances are CSS only (no exit animations), so the end state never waits
 * on animation frames.
 */
import type { ReactNode } from 'react';
import { BadgeCheck, Check, ChevronRight, LayoutGrid, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Court } from '@/types';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';
import '@/features/court-reservations/courtReservations.css';
import type { AtClubChoice, CourtPlanSlot } from './courtPlanModel';

type Props = {
  slots: readonly CourtPlanSlot[];
  /** Reserve now: the courts "Any court" slots would be booked on at the chosen time. */
  filledSlots: readonly CourtPlanSlot[] | null;
  courts: readonly Court[];
  choice: AtClubChoice | null;
  min: number;
  max: number;
  onCountChange: (count: number) => void;
  onOpenSlot: (index: number) => void;
  /** No courts listed for this club: only the count matters. */
  hideChips?: boolean;
};

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition active:scale-95 disabled:opacity-35 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

export function CourtPlanCourts({
  slots,
  filledSlots,
  courts,
  choice,
  min,
  max,
  onCountChange,
  onOpenSlot,
  hideChips = false,
}: Props) {
  const { t } = useTranslation();
  const count = slots.length;
  const courtName = (id: string | null) => {
    const court = id ? courts.find((c) => c.id === id) : undefined;
    return court ? resolveCourtNameParts(court.name, court.integrationCourtName).name : null;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
          <LayoutGrid size={13} aria-hidden />
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{t('createGame.courtPlan.courts')}</span>
        <div className="ms-auto flex items-center gap-2">
          <StepButton
            label={t('createGame.courtPlan.fewerCourts')}
            disabled={count <= min}
            onClick={() => onCountChange(count - 1)}
          >
            <Minus size={18} aria-hidden />
          </StepButton>
          <span
            className="relative inline-flex w-6 justify-center overflow-hidden text-base font-semibold tabular-nums text-gray-900 dark:text-white"
            aria-live="polite"
          >
            <span key={count} className="cr-enter">
              {count}
            </span>
          </span>
          <StepButton
            label={t('createGame.courtPlan.moreCourts')}
            disabled={count >= max}
            onClick={() => onCountChange(count + 1)}
          >
            <Plus size={18} aria-hidden />
          </StepButton>
        </div>
      </div>
      {hideChips ? null : (
        <ul className="flex flex-wrap gap-2">
            {slots.map((slot, index) => {
              const name = courtName(slot.courtId);
              const filled = !slot.courtId ? courtName(filledSlots?.[index]?.courtId ?? null) : null;
              const reserved = Boolean(slot.bookingId) || (choice === 'alreadyReserved' && slot.reported);
              return (
                <li key={index} className="cr-enter">
                  <button
                    type="button"
                    onClick={() => onOpenSlot(index)}
                    aria-label={t('createGame.courtPlan.slotLabel', { n: index + 1 })}
                    className={`flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                      slot.courtId
                        ? 'border-primary-200 bg-primary-50 text-primary-900 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-100'
                        : 'border-dashed border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200'
                    }`}
                  >
                    {slot.bookingId ? (
                      <BadgeCheck size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : reserved ? (
                      <Check size={15} strokeWidth={2.5} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    ) : null}
                    <span className="truncate max-w-[10rem]">{name ?? t('createGame.courtPlan.anyCourt')}</span>
                    {filled ? (
                      <span className="truncate max-w-[7rem] text-xs font-normal text-gray-500 dark:text-gray-400">
                        · {filled}
                      </span>
                    ) : null}
                    <ChevronRight size={14} className="shrink-0 opacity-50" aria-hidden />
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
