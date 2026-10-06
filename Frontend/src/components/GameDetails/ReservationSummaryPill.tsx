import { useTranslation } from 'react-i18next';
import { CalendarClock, Check, Clock, UserCheck, type LucideIcon } from 'lucide-react';
import { isReservedByReportOnly } from '@shared/gameBooking/reservationCopy';
import type { ReservationSummaryKind } from '@shared/gameBooking/courtReservations';
import { ReservationPill } from '@/features/court-reservations/ReservationPill';
import { pillToneForSummary } from '@/features/court-reservations/reservationPillTone';
import {
  formatReservationCopy,
  type CourtReservationView,
  type ReservationTimeFormatter,
} from '@/utils/courtReservationView';

const INLINE_ICONS: Record<ReservationSummaryKind, LucideIcon> = {
  planned: CalendarClock,
  partial: CalendarClock,
  reserved: Check,
  reserved_with_gap: Clock,
};

const INLINE_CLASSES: Record<ReservationSummaryKind, string> = {
  planned: 'text-gray-500 dark:text-gray-400',
  partial: 'text-amber-600 dark:text-amber-400',
  reserved: 'text-emerald-600 dark:text-emerald-400',
  reserved_with_gap: 'text-amber-600 dark:text-amber-400',
};

type ReservationSummaryPillProps = {
  view: CourtReservationView;
  formatTime: ReservationTimeFormatter;
  /** `pill` — the shared reservation chip (game details); `inline` — quiet text for the card meta line. */
  variant?: 'pill' | 'inline';
};

/**
 * Court reservation summary of a game, read-only:
 * Planned / k of N reserved / All courts reserved / Reserved, gap at HH:MM.
 */
export function ReservationSummaryPill({ view, formatTime, variant = 'pill' }: ReservationSummaryPillProps) {
  const { t } = useTranslation();
  const { summary } = view;
  const label = formatReservationCopy(view.copy, t, formatTime);

  // Marked reserved by the organizer only: never the green "booked" look.
  const reportedOnly = summary.kind === 'reserved' && !view.approximate && isReservedByReportOnly(view.slots);

  if (variant === 'inline') {
    const Icon = reportedOnly ? UserCheck : INLINE_ICONS[summary.kind];
    return (
      <span
        className={`inline-flex items-center gap-1 font-medium ${reportedOnly ? 'text-sky-700 dark:text-sky-300' : INLINE_CLASSES[summary.kind]}`}
        data-testid="court-reservation-summary"
        data-kind={summary.kind}
      >
        <Icon size={12} className="shrink-0" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <ReservationPill
      tone={view.approximate ? pillToneForSummary(summary) : pillToneForSummary(summary, view.slots)}
      label={label}
      size="compact"
      progress={summary.total > 0 ? summary.reserved / summary.total : 0}
      linked={view.slots.some((slot) => slot.state === 'linked')}
    />
  );
}
