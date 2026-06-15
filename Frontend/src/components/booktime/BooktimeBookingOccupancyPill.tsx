import { useTranslation } from 'react-i18next';
import type { BookingSlotSegmentState } from '@shared/gameBooking/linkBookingToGame';
import { bookingSlotSegmentsOccupancyPercent } from '@shared/gameBooking/linkBookingToGame';

const SEGMENT_CLASS: Record<BookingSlotSegmentState, string> = {
  empty: 'bg-gray-200 dark:bg-gray-600',
  partial: 'bg-primary-400 dark:bg-primary-500',
  full: 'bg-emerald-500 dark:bg-emerald-400',
  overlap: 'bg-red-500 dark:bg-red-400',
};

type Props = {
  segments: BookingSlotSegmentState[];
};

export function BooktimeBookingOccupancyPill({ segments }: Props) {
  const { t } = useTranslation();
  if (segments.length === 0) return null;

  const percent = bookingSlotSegmentsOccupancyPercent(segments);

  return (
    <span
      className="inline-flex shrink-0 items-center gap-px rounded px-0.5 py-0.5"
      title={t('club.booktime.slotOccupancyHint', { percent })}
      aria-label={t('club.booktime.slotOccupancyHint', { percent })}
    >
      {segments.map((segment, index) => (
        <span
          key={index}
          className={`h-2 w-2 rounded-[2px] ${SEGMENT_CLASS[segment]}`}
        />
      ))}
    </span>
  );
}
