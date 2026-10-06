/**
 * The direct message a host receives when the club cancels their game or releases their court.
 * Date and time are on the **club** wall clock (the game happens there), formatted for the
 * message language — never the operator's device zone or a hard-coded `en-GB`.
 */
import { resolveAppLocale } from '@/utils/displayPreferences';
import { resolveIntlLocale } from '@/utils/intlLocale';

export type CourtActionMode = 'cancel' | 'clear';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface CancelMessageInput {
  mode: CourtActionMode;
  hostFirstName: string | null;
  clubName: string;
  startTime: string;
  timeZone: string;
  /** App language code of the message (`en`, `ru`, `sr`, …). */
  language: string;
  reason: string;
  note?: string;
  /** `t` bound to the `clubAdmin` namespace *in `language`* (`i18n.getFixedT(language, 'clubAdmin')`). */
  t: Translate;
}

export function formatClubDateTimeFor(startTime: string, timeZone: string, language: string): { date: string; time: string } {
  const locale = resolveIntlLocale(resolveAppLocale(language));
  const at = new Date(startTime);
  try {
    return {
      date: new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(at),
      time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(at),
    };
  } catch {
    return {
      date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(at),
      time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(at),
    };
  }
}

export function buildCancelMessage(input: CancelMessageInput): string {
  const { date, time } = formatClubDateTimeFor(input.startTime, input.timeZone, input.language);
  const note = input.note?.trim();
  return input.t(input.mode === 'clear' ? 'dm.courtCleared' : 'dm.courtCancelled', {
    hostName: input.hostFirstName?.trim() || input.t('dm.hostFallback'),
    club: input.clubName,
    date,
    time,
    reason: input.reason.trim() || '…',
    note: note ? ` ${note}` : '',
    interpolation: { escapeValue: false },
  });
}
