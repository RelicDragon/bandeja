/**
 * Strings for this feature: namespace `courtReservation` (owned, see
 * `src/i18n/namespaces.ts`) + club-timezone time formatting.
 *
 * `@shared/gameBooking/reservationCopy` describes states as `ReservationCopy`
 * with flat-style keys and ISO params; {@link useCourtReservationText} turns
 * that into text. Other features (badges, cards) should use this hook rather
 * than calling `t(copy.i18nKey)` themselves — the namespace is owned, so the
 * flat key would not resolve.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import type { ReservationCopy } from '@shared/gameBooking/reservationCopy';
import { createClubTimeFormatter, type ClubTimeFormatter } from './clubTime';
import { formatCompactDuration, formatDuration, formatList, translateReservationCopy } from './reservationText';

export {
  COURT_RESERVATION_NS,
  formatCompactDuration,
  formatDuration,
  formatList,
  toNamespaceKey,
  translateReservationCopy,
} from './reservationText';

export function useClubTime(timeZone: string | null | undefined): ClubTimeFormatter {
  const user = useAuthStore((state) => state.user);
  return useMemo(() => {
    const settings = resolveDisplaySettings(user);
    return createClubTimeFormatter({
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: settings.locale,
      hour12: settings.hour12,
    });
  }, [timeZone, user]);
}

export function useCourtReservationText(timeZone: string | null | undefined) {
  const { t, i18n } = useTranslation('courtReservation');
  const clock = useClubTime(timeZone);
  const locale = i18n?.resolvedLanguage ?? i18n?.language;
  return useMemo(
    () => ({
      t,
      clock,
      copy: (copy: ReservationCopy) => translateReservationCopy(t, copy, clock),
      duration: (minutes: number) => formatDuration(t, minutes),
      /** "1h 30m" — for tight spots (steppers). */
      compactDuration: (minutes: number) => formatCompactDuration(t, minutes, locale),
      list: (items: readonly string[], type?: 'conjunction' | 'disjunction') => formatList(items, locale, type),
    }),
    [t, clock, locale],
  );
}

export type CourtReservationText = ReturnType<typeof useCourtReservationText>;
