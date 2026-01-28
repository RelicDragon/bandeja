import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import type { Game } from '@/types';

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getClubTimezone(game: Game | null | undefined): string | null {
  return game?.city?.timezone ?? null;
}

function formatTimeInTimezone(
  date: Date | string,
  timezone: string,
  settings: ResolvedDisplaySettings
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(settings.locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: settings.hour12,
  }).format(d);
}

function formatDatePartInTimezone(
  date: Date | string,
  timezone: string,
  settings: ResolvedDisplaySettings,
  part: 'weekday' | 'long' | 'shortTime' | 'weekdayAndDate'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (part === 'weekday') {
    return new Intl.DateTimeFormat(settings.locale, {
      timeZone: timezone,
      weekday: 'long',
    }).format(d);
  }
  if (part === 'long') {
    return new Intl.DateTimeFormat(settings.locale, {
      timeZone: timezone,
      dateStyle: 'long',
    }).format(d);
  }
  if (part === 'weekdayAndDate') {
    return new Intl.DateTimeFormat(settings.locale, {
      timeZone: timezone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(d);
  }
  return new Intl.DateTimeFormat(settings.locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: settings.hour12,
  }).format(d);
}

function getDateKeyInTimezone(date: Date | string, timezone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export interface GameTimeDisplayResult {
  primaryText: string;
  hintText: string | null;
}

function buildYourTimeHint(
  date: Date | string,
  userTz: string,
  settings: ResolvedDisplaySettings,
  includeDate: boolean,
  endTime: Date | string | null | undefined,
  t: (key: string) => string
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const timeStr = formatDatePartInTimezone(d, userTz, settings, 'shortTime');
  const timePart = endTime
    ? `${timeStr} – ${formatDatePartInTimezone(typeof endTime === 'string' ? new Date(endTime) : endTime, userTz, settings, 'shortTime')}`
    : timeStr;
  if (includeDate) {
    const dateStr = getDateLabelInClubTz(date, userTz, settings, t);
    return `${dateStr}, ${timePart}`;
  }
  return timePart;
}

export interface GameTimeDisplayOptions {
  game: Game | null | undefined;
  displaySettings: ResolvedDisplaySettings;
  startTime: string;
  endTime?: string | null;
  kind: 'time' | 'weekday' | 'longDate' | 'timeRange';
  t: (key: string, opts?: Record<string, string>) => string;
}

export function getGameTimeDisplay(options: GameTimeDisplayOptions): GameTimeDisplayResult {
  const { game, displaySettings, startTime, endTime, kind, t } = options;
  const clubTz = getClubTimezone(game);
  const userTz = getUserTimezone();

  const formatPrimary = (tz: string) => {
    if (kind === 'time') {
      return formatTimeInTimezone(startTime, tz, displaySettings);
    }
    if (kind === 'weekday') {
      return formatDatePartInTimezone(startTime, tz, displaySettings, 'weekday');
    }
    if (kind === 'longDate') {
      return formatDatePartInTimezone(startTime, tz, displaySettings, 'long');
    }
    if (kind === 'timeRange' && endTime) {
      const start = formatTimeInTimezone(startTime, tz, displaySettings);
      const end = formatTimeInTimezone(endTime, tz, displaySettings);
      return `${start} – ${end}`;
    }
    return formatTimeInTimezone(startTime, tz, displaySettings);
  };

  if (!clubTz || clubTz === userTz) {
    return {
      primaryText: formatPrimary(userTz),
      hintText: null,
    };
  }

  const primaryText = formatPrimary(clubTz);
  const userPrimaryText = formatPrimary(userTz);
  const clubDateKey = getDateKeyInTimezone(startTime, clubTz);
  const userDateKey = getDateKeyInTimezone(startTime, userTz);
  const dateDiffers = clubDateKey !== userDateKey;
  const timeOrDateDiffers = primaryText !== userPrimaryText || dateDiffers;

  if (!timeOrDateDiffers) {
    return { primaryText, hintText: null };
  }

  const hintContent = buildYourTimeHint(
    startTime,
    userTz,
    displaySettings,
    dateDiffers,
    endTime ?? null,
    t
  );
  const hintText = t('gameDetails.yourTime', { time: hintContent });

  return { primaryText, hintText };
}

export function formatGameTimeInTimezone(
  date: Date | string,
  timezone: string,
  settings: ResolvedDisplaySettings
): string {
  return formatTimeInTimezone(date, timezone, settings);
}

export function formatGameDateInTimezone(
  date: Date | string,
  timezone: string,
  settings: ResolvedDisplaySettings,
  part: 'weekday' | 'long' | 'shortTime' | 'weekdayAndDate'
): string {
  return formatDatePartInTimezone(date, timezone, settings, part);
}

export function getDateLabelInClubTz(
  date: Date | string,
  clubTz: string | null,
  displaySettings: ResolvedDisplaySettings,
  t: (key: string) => string
): string {
  if (!clubTz) {
    return '';
  }
  const now = new Date();
  const gameKey = getDateKeyInTimezone(date, clubTz);
  const todayKey = getDateKeyInTimezone(now, clubTz);
  const tomorrowKey = getDateKeyInTimezone(new Date(now.getTime() + 86400000), clubTz);
  const yesterdayKey = getDateKeyInTimezone(new Date(now.getTime() - 86400000), clubTz);
  if (gameKey === todayKey) return t('createGame.today');
  if (gameKey === tomorrowKey) return t('createGame.tomorrow');
  if (gameKey === yesterdayKey) return t('createGame.yesterday');
  return formatDatePartInTimezone(date, clubTz, displaySettings, 'weekdayAndDate');
}
