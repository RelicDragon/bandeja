/**
 * Time change — localized copy shared by the push and Telegram notices.
 *
 * Times are rendered in the **game's** city timezone: the game happens there,
 * and the chat line ("Game date/time changed to …") reads the same way.
 */
import { t } from '../../utils/translations';
import { formatDateInTimezone, getDateLabelInTimezone, getShortDayOfWeek } from '../user-timezone.service';
import { formatDuration } from '../telegram/utils';
import { getEntityTypeLabel, resolveGameClubPlace } from '../shared/notification-base';

export type TimeChangeNoticeCopy = {
  title: string;
  /** Body lines, in order: schedule, then the optional asks. */
  lines: string[];
  shortDayOfWeek: string;
};

export type TimeChangeNoticeCopyInput = {
  entityType: string;
  startTime: Date;
  endTime: Date;
  previousStartTime: Date;
  club?: { name: string } | null;
  court?: { club?: { name: string } | null } | null;
  timezone: string;
  lang: string;
  /** Ask the recipient to answer again (everyone but the owner). */
  asksAttendance: boolean;
  /** The recipient attached a linked booking that no longer covers the game. */
  bookingNeedsAttention: boolean;
};

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.split(`{{${key}}}`).join(value),
    template,
  );
}

async function describeInstant(at: Date, timezone: string, lang: string) {
  const [dateLabel, shortDayOfWeek, time] = await Promise.all([
    getDateLabelInTimezone(at, timezone, lang, false),
    getShortDayOfWeek(at, timezone, lang),
    formatDateInTimezone(at, 'HH:mm', timezone, lang),
  ]);
  return { dateLabel, shortDayOfWeek, time };
}

export async function buildTimeChangeNoticeCopy(
  input: TimeChangeNoticeCopyInput,
): Promise<TimeChangeNoticeCopy> {
  const { lang, timezone } = input;
  const [next, previous] = await Promise.all([
    describeInstant(input.startTime, timezone, lang),
    describeInstant(input.previousStartTime, timezone, lang),
  ]);
  const duration = formatDuration(input.startTime, input.endTime, lang);

  const newTime = [next.shortDayOfWeek, next.dateLabel, next.time].filter(Boolean).join(' ');
  const sameDay = next.dateLabel === previous.dateLabel;
  // "was 18:00" reads better than repeating the date when only the hour moved.
  const oldTime = sameDay
    ? previous.time
    : [previous.shortDayOfWeek, previous.dateLabel, previous.time].filter(Boolean).join(' ');

  const entityLabel = getEntityTypeLabel(input.entityType, lang);
  const baseTitle = t('timeChange.title', lang);
  const title = entityLabel ? `${entityLabel}: ${baseTitle}` : baseTitle;

  const lines = [
    fill(t('timeChange.body', lang), {
      place: resolveGameClubPlace(
        { club: input.club ?? null, court: input.court?.club ? { club: input.court.club } : null },
        lang,
      ),
      newTime: duration ? `${newTime} (${duration})` : newTime,
      oldTime,
    }),
  ];
  if (input.asksAttendance) lines.push(t('timeChange.answerAgain', lang));
  if (input.bookingNeedsAttention) lines.push(t('timeChange.bookingAttention', lang));

  return { title, lines, shortDayOfWeek: next.shortDayOfWeek };
}
