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

/* ------------------------------------------------------------------ */
/* Combined notice for a batch (series "this and following" edit)      */
/* ------------------------------------------------------------------ */

/** Dated lines shown before "+N more". */
export const TIME_CHANGE_BATCH_LIST_LIMIT = 5;

export type TimeChangeBatchNoticeCopyInput = {
  entityType: string;
  /** Series name (title prefix); falls back to the entity label. */
  seriesName?: string | null;
  /** The recipient's games, earliest first. */
  games: { startTime: Date; endTime: Date; previousStartTime: Date }[];
  club?: { name: string } | null;
  court?: { club?: { name: string } | null } | null;
  timezone: string;
  lang: string;
  asksAttendance: boolean;
  bookingNeedsAttention: boolean;
};

/**
 * One notice for several games of one batch. When every game moved the same
 * way (same weekday + time + length before and after) it reads as one line —
 * "3 upcoming games from 13 Oct now Tue 19:00 (1h 30m) (was 18:00)";
 * otherwise each game gets a dated line, capped at
 * {@link TIME_CHANGE_BATCH_LIST_LIMIT}.
 */
export async function buildTimeChangeBatchNoticeCopy(
  input: TimeChangeBatchNoticeCopyInput,
): Promise<TimeChangeNoticeCopy> {
  const { lang, timezone } = input;
  const described = await Promise.all(
    input.games.map(async (game) => {
      const [next, previous] = await Promise.all([
        describeInstant(game.startTime, timezone, lang),
        describeInstant(game.previousStartTime, timezone, lang),
      ]);
      return { next, previous, duration: formatDuration(game.startTime, game.endTime, lang) };
    }),
  );

  const place = resolveGameClubPlace(
    { club: input.club ?? null, court: input.court?.club ? { club: input.court.club } : null },
    lang,
  );
  const entityLabel = getEntityTypeLabel(input.entityType, lang);
  const prefix = input.seriesName?.trim() || entityLabel;
  const baseTitle = t('timeChange.title', lang);
  const title = prefix ? `${prefix}: ${baseTitle}` : baseTitle;

  const pattern = (d: (typeof described)[number]) =>
    JSON.stringify([d.next.shortDayOfWeek, d.next.time, d.duration, d.previous.shortDayOfWeek, d.previous.time]);
  const uniform = described.every((d) => pattern(d) === pattern(described[0]));

  const lines: string[] = [];
  if (uniform && described.length > 0) {
    const first = described[0];
    const newTime = [first.next.shortDayOfWeek, first.next.time].filter(Boolean).join(' ');
    const sameWeekday = first.next.shortDayOfWeek === first.previous.shortDayOfWeek;
    lines.push(
      fill(t('timeChange.batchSameTime', lang), {
        place,
        count: String(described.length),
        firstDate: first.next.dateLabel,
        newTime: first.duration ? `${newTime} (${first.duration})` : newTime,
        oldTime: sameWeekday
          ? first.previous.time
          : [first.previous.shortDayOfWeek, first.previous.time].filter(Boolean).join(' '),
      }),
    );
  } else {
    lines.push(fill(t('timeChange.batchListIntro', lang), { place, count: String(described.length) }));
    for (const d of described.slice(0, TIME_CHANGE_BATCH_LIST_LIMIT)) {
      const newTime = [d.next.shortDayOfWeek, d.next.dateLabel, d.next.time].filter(Boolean).join(' ');
      const sameDay = d.next.dateLabel === d.previous.dateLabel;
      const oldTime = sameDay
        ? d.previous.time
        : [d.previous.shortDayOfWeek, d.previous.dateLabel, d.previous.time].filter(Boolean).join(' ');
      lines.push(`• ${fill(t('timeChange.batchListItem', lang), { newTime, oldTime })}`);
    }
    const more = described.length - TIME_CHANGE_BATCH_LIST_LIMIT;
    if (more > 0) lines.push(fill(t('timeChange.batchMore', lang), { count: String(more) }));
  }
  if (input.asksAttendance) lines.push(t('timeChange.batchAnswerAgain', lang));
  if (input.bookingNeedsAttention) lines.push(t('timeChange.batchBookingAttention', lang));

  return { title, lines, shortDayOfWeek: described[0]?.next.shortDayOfWeek ?? '' };
}
