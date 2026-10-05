/**
 * One "do this at the club" line: what to do, in words, with the club's
 * clock. Optional "Done" dismisses it (the organizer handled it).
 */
import { Check, Phone } from 'lucide-react';
import type { ClubFollowUp } from './clubFollowUps';
import type { CourtRef } from './courtReservationsModel';
import { clubFollowUpText } from './courtReservationsCopy';
import type { CourtReservationText } from './useCourtReservationText';

export function ClubFollowUpRow({
  followUp,
  text,
  courtsById,
  onDone,
}: {
  followUp: ClubFollowUp;
  text: CourtReservationText;
  courtsById: Readonly<Record<string, CourtRef>>;
  onDone?: (id: string) => void;
}) {
  const { t } = text;
  return (
    <li className="flex min-h-[44px] items-center gap-3 rounded-xl bg-amber-50/70 px-3 py-2 dark:bg-amber-950/30">
      <Phone size={16} aria-hidden className="shrink-0 text-amber-700 dark:text-amber-300" />
      <span className="min-w-0 flex-1 text-sm leading-snug text-amber-950 dark:text-amber-100">
        {clubFollowUpText(followUp, text, courtsById)}
      </span>
      {onDone ? (
        <button
          type="button"
          onClick={() => onDone(followUp.id)}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-amber-800 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-200 dark:hover:bg-amber-900/40"
        >
          <Check size={14} aria-hidden />
          {t('followUp.done')}
        </button>
      ) : null}
    </li>
  );
}
