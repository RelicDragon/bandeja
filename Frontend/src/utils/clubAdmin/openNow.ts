export function isClubOpenNow(
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
  now = new Date()
): boolean | null {
  if (!openingTime || !closingTime) return null;
  const [oh, om] = openingTime.split(':').map(Number);
  const [ch, cm] = closingTime.split(':').map(Number);
  if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  if (close > open) return mins >= open && mins < close;
  return mins >= open || mins < close;
}
