/**
 * Location step for games with courts, in one calm order:
 * Club → Date → Courts → "At the club?" → Time → summary.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club, Court } from '@/types';
import { ReservationPill, pillToneForSummary, useCourtReservationText } from '@/features/court-reservations';
import { describeReservationSummary, isReservedByReportOnly } from '@shared/gameBooking/reservationCopy';
import type { ReservationSummary } from '@shared/gameBooking/courtReservations';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { booktimeIsoToUtcIso } from '@shared/booktime/localTime';
import { CourtPlanCourts } from './CourtPlanCourts';
import { CourtPickerSheet } from './CourtPickerSheet';
import { CourtPlanAtClub } from './CourtPlanAtClub';
import { reservedSlotCount } from './courtPlanModel';
import type { CreateGameCourtPlan } from './useCreateGameCourtPlan';

type Props = {
  club: Club;
  courts: Court[];
  plan: CreateGameCourtPlan;
  clubSection: ReactNode;
  dateSection: ReactNode;
  timeSection: ReactNode;
  footer?: ReactNode;
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  locale: string;
  formatRange: (time: string, durationHours: number) => string;
};

export function CreateGameCourtPlanSection({
  club,
  courts,
  plan,
  clubSection,
  dateSection,
  timeSection,
  footer,
  selectedDate,
  selectedTime,
  duration,
  locale,
  formatRange,
}: Props) {
  const { t } = useTranslation();
  const text = useCourtReservationText(getClubTimezone(club));
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const choice = plan.choice ?? 'notYet';

  const linkedRecordById = useMemo(
    () => new Map(plan.linkedRecords.map((r) => [r.uuid, r])),
    [plan.linkedRecords],
  );
  const sheetSlot = sheetIndex != null ? plan.slots[sheetIndex] : undefined;
  const sheetRecord = sheetSlot?.bookingId ? linkedRecordById.get(sheetSlot.bookingId) : undefined;
  const clubTimeZone = getClubTimezone(club);
  const sheetLinkedLabel = sheetRecord
    ? text.clock.range(
        booktimeIsoToUtcIso(sheetRecord.bookingStart, clubTimeZone) ?? sheetRecord.bookingStart,
        booktimeIsoToUtcIso(sheetRecord.bookingEnd, clubTimeZone) ?? sheetRecord.bookingEnd,
      )
    : null;

  const reserved = reservedSlotCount(plan.slots);
  const total = plan.slots.length;
  const pill = (() => {
    if (choice === 'reserveNow') return { tone: 'planned' as const, label: t('createGame.courtPlan.summary.willReserve') };
    const summary: ReservationSummary =
      choice !== 'alreadyReserved' || reserved === 0
        ? { kind: 'planned', reserved: 0, total, gapCount: 0 }
        : reserved < total
          ? { kind: 'partial', reserved, total, gapCount: 0 }
          : { kind: 'reserved', reserved, total, gapCount: 0 };
    // Marked-reserved only (no linked reservation) never looks like a club booking.
    const slotStates = plan.slots.map((s) => ({ state: s.bookingId ? ('linked' as const) : s.reported ? ('reported' as const) : ('planned' as const) }));
    const reportedOnly = isReservedByReportOnly(slotStates);
    return {
      tone: pillToneForSummary(summary, slotStates),
      label: text.copy(describeReservationSummary(summary, { reportedOnly })),
    };
  })();

  const courtNames = (plan.filledSlots ?? plan.slots)
    .map((s) => courts.find((c) => c.id === s.courtId))
    .filter((c): c is Court => c != null)
    .map((c) => resolveCourtNameParts(c.name, c.integrationCourtName).name);

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(selectedDate),
    [locale, selectedDate],
  );

  return (
    <div className="space-y-5">
      {clubSection}
      {dateSection}
      <CourtPlanCourts
        slots={plan.slots}
        filledSlots={plan.choice === 'reserveNow' ? plan.filledSlots : null}
        courts={courts}
        choice={plan.choice}
        min={plan.countBounds.min}
        max={plan.countBounds.max}
        onCountChange={plan.setCount}
        onOpenSlot={setSheetIndex}
        hideChips={courts.length === 0}
      />
      <CourtPlanAtClub
        club={club}
        courts={courts}
        choice={choice}
        choices={plan.choices}
        onChoiceChange={plan.setChoice}
        courtCount={total}
        needsAuth={plan.needsAuth}
        integrationConfig={plan.booktimeConfig}
        onAuthConnected={plan.onAuthConnected}
        canListReservations={plan.canListReservations}
        connected={plan.connected}
        reservations={{
          dateBookings: plan.reservations.dateBookings,
          loading: plan.reservations.authLoading || plan.reservations.bookingsLoading,
          loaded: plan.reservations.bookingsLoaded,
          clubTimezone: plan.reservations.clubTimezone,
        }}
        linkedIds={plan.linkedRecords.map((r) => r.uuid)}
        onToggleReservation={plan.toggleReservation}
        unlinkedReservedCount={plan.slots.filter((s) => !s.bookingId && s.reported).length}
        timePrompt={plan.timePrompt}
        formatRange={formatRange}
        onAnswerTimePrompt={plan.answerTimePrompt}
      />
      {plan.needsAuth ? null : timeSection}
      {selectedTime && !plan.needsAuth ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl bg-gray-50 px-3 py-2.5 text-sm dark:bg-gray-900/60">
          <span className="font-medium text-gray-900 dark:text-white tabular-nums">
            {dateLabel} · {formatRange(selectedTime, duration)}
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {courtNames.length > 0 ? courtNames.join(', ') : t('createGame.courtPlan.summary.courts', { count: total })}
          </span>
          <ReservationPill
            className="ms-auto"
            size="compact"
            tone={pill.tone}
            label={pill.label}
            linked={plan.linkedRecords.length > 0}
          />
        </div>
      ) : null}
      {footer}
      <CourtPickerSheet
        open={sheetIndex != null}
        onOpenChange={(open) => {
          if (!open) setSheetIndex(null);
        }}
        index={sheetIndex}
        slots={plan.slots}
        courts={courts}
        choice={plan.choice}
        states={plan.courtStatesAtSelectedTime}
        bookableCourtIds={plan.bookableCourtIds}
        linkedLabel={sheetLinkedLabel}
        onPick={(courtId) => {
          if (sheetIndex != null) plan.setSlotCourt(sheetIndex, courtId);
        }}
        onRemoveReservation={() => {
          if (sheetRecord) plan.toggleReservation(sheetRecord);
        }}
      />
    </div>
  );
}
