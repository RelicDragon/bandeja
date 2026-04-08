const MINUTES_IN_DAY = 1440;

export const timeStringToMinutes = (time: string): number => {
  if (!time) return 0;
  if (time === '24:00') return MINUTES_IN_DAY;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export const gameStartFallsInTimeRange = (
  startTimeIso: string,
  rangeStart: string,
  rangeEnd: string
): boolean => {
  if (rangeStart === '00:00' && rangeEnd === '24:00') return true;
  const d = new Date(startTimeIso);
  const gameM = d.getHours() * 60 + d.getMinutes();
  const startM = timeStringToMinutes(rangeStart);
  const endM = timeStringToMinutes(rangeEnd);
  if (endM >= MINUTES_IN_DAY) {
    return gameM >= startM;
  }
  return gameM >= startM && gameM < endM;
};
