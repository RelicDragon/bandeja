import { useMemo } from 'react';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { formatBooktimeBookingSlotRange } from './booktimeBookingUtils';

type Props = {
  bookings: BooktimeBookingRecord[];
  clubTimezone?: string | null;
};

export function BooktimeSlotTimeCards({ bookings, clubTimezone }: Props) {
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {bookings.map((booking) => (
        <span
          key={booking.uuid}
          className="inline-flex rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/60 px-2 py-1 text-[10px] font-medium tabular-nums text-gray-700 dark:text-gray-300"
        >
          {formatBooktimeBookingSlotRange(booking, {
            timezone: clubTimezone,
            displaySettings,
          })}
        </span>
      ))}
    </div>
  );
}
