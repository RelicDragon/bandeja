import { AlertTriangle, Check } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { BooktimeLinkedGame } from '@/api/booktime';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { linkedGamesBookingSlotSegments } from '@/services/gameBooking/linkBookingToGame';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { isReservationSlotDimmed } from '@/components/gameLocationTime/reservationSlotSelection';
import { BooktimeBookingOccupancyPill } from './BooktimeBookingOccupancyPill';
import { BooktimeBookingPriceLabel } from './BooktimeBookingPriceLabel';
import type { BooktimeBookingPriceQuote } from './booktimeBookingPrices';
import { formatBooktimeBookingSlotRange } from './booktimeBookingUtils';

type HourOption = {
  booking: BooktimeBookingRecord;
  linkedGames: BooktimeLinkedGame[];
  priceQuote: BooktimeBookingPriceQuote | null;
};

type Props = {
  options: HourOption[];
  selectedBookingIds: readonly string[];
  selectionMax: number;
  clubTimezone?: string | null;
  onToggleBooking: (bookingId: string) => void;
};

const spring = { type: 'spring' as const, stiffness: 420, damping: 32 };

function LinkedHint({ games }: { games: BooktimeLinkedGame[] }) {
  const { t } = useTranslation();
  if (games.length === 0) return null;
  const labels = games.map((g) => g.name?.trim() || g.id).join(', ');
  return (
    <span className="mt-1.5 flex min-w-0 items-start gap-1 text-[10px] font-medium leading-snug text-amber-800 dark:text-amber-200">
      <AlertTriangle size={10} className="mt-0.5 shrink-0" aria-hidden />
      <span className="line-clamp-2">{t('createGame.locationTime.alsoUsedIn', { games: labels })}</span>
    </span>
  );
}

export function BooktimeAdjacentHourPicker({
  options,
  selectedBookingIds,
  selectionMax,
  clubTimezone,
  onToggleBooking,
}: Props) {
  const { t } = useTranslation();
  const layoutId = useId();
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const selectedIdSet = useMemo(() => new Set(selectedBookingIds), [selectedBookingIds]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium tracking-wide text-gray-500 dark:text-gray-400">
        {t('createGame.locationTime.pickAdjacentHour')}
      </p>
      <div
        role="listbox"
        aria-label={t('createGame.locationTime.pickAdjacentHour')}
        aria-multiselectable={selectionMax > 1}
        className="grid gap-px overflow-hidden rounded-xl bg-gray-200/80 shadow-inner dark:bg-gray-700/80"
        style={{
          gridTemplateColumns:
            options.length <= 2
              ? `repeat(${options.length}, minmax(0, 1fr))`
              : 'repeat(2, minmax(0, 1fr))',
        }}
      >
        {options.map((option) => {
          const selected = selectedIdSet.has(option.booking.uuid);
          const dimmed = isReservationSlotDimmed(
            selected,
            selectedBookingIds.length,
            selectionMax,
          );
          const segments = linkedGamesBookingSlotSegments(
            option.booking,
            option.linkedGames,
            clubTimezone,
          );
          const range = formatBooktimeBookingSlotRange(option.booking, {
            timezone: clubTimezone,
            displaySettings,
          });

          return (
            <motion.button
              key={option.booking.uuid}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={dimmed}
              whileTap={dimmed ? undefined : { scale: 0.985 }}
              onClick={() => onToggleBooking(option.booking.uuid)}
              className={`relative min-h-[4.75rem] px-2.5 py-2.5 text-left outline-none transition-[opacity,colors] duration-200 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-primary-500 ${
                selected
                  ? 'bg-primary-50 dark:bg-primary-950/50'
                  : 'bg-white dark:bg-gray-900'
              } ${dimmed ? 'opacity-45 cursor-default' : 'cursor-pointer hover:bg-primary-50/60 dark:hover:bg-primary-950/30'}`}
            >
              {selected ? (
                <motion.span
                  layoutId={`adjacent-hour-glow-${layoutId}`}
                  transition={spring}
                  className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary-400/90 dark:ring-primary-500/80"
                />
              ) : null}

              <div className="relative z-10 flex items-start justify-between gap-2">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    selected
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                  }`}
                >
                  {selected ? (
                    <motion.span
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={spring}
                    >
                      <Check size={12} strokeWidth={2.5} />
                    </motion.span>
                  ) : null}
                </span>
                <BooktimeBookingOccupancyPill segments={segments} />
              </div>

              <p
                className={`relative z-10 mt-2 text-sm font-semibold tabular-nums tracking-tight ${
                  selected
                    ? 'text-primary-800 dark:text-primary-100'
                    : 'text-gray-900 dark:text-white'
                }`}
              >
                {range}
              </p>

              {option.priceQuote ? (
                <BooktimeBookingPriceLabel
                  quote={option.priceQuote}
                  className="relative z-10 mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400"
                />
              ) : null}

              <div className="relative z-10">
                <LinkedHint games={option.linkedGames} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
