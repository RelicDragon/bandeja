const MINUTES_IN_DAY = 1440;

export const timeStringToMinutes = (time: string): number => {
  if (!time) return 0;
  if (time === '24:00') return MINUTES_IN_DAY;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const minuteFormatterCache = new Map<string, Intl.DateTimeFormat>();

function minutesInTimezone(startTimeIso: string, timeZone: string): number {
  let formatter = minuteFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    minuteFormatterCache.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(new Date(startTimeIso));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export const gameStartFallsInTimeRange = (
  startTimeIso: string,
  rangeStart: string,
  rangeEnd: string,
  timeZone?: string | null,
): boolean => {
  if (rangeStart === '00:00' && rangeEnd === '24:00') return true;
  const gameM = timeZone
    ? minutesInTimezone(startTimeIso, timeZone)
    : (() => {
        const d = new Date(startTimeIso);
        return d.getHours() * 60 + d.getMinutes();
      })();
  const startM = timeStringToMinutes(rangeStart);
  const endM = timeStringToMinutes(rangeEnd);
  if (endM >= MINUTES_IN_DAY) {
    return gameM >= startM;
  }
  return gameM >= startM && gameM < endM;
};
