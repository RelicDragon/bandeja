export function roundDisplayMinutes(totalMinutes: number): number {
  return Math.max(5, Math.round(totalMinutes / 5) * 5);
}

export function formatEventDurationLabel(totalMinutes: number): string {
  const rounded = roundDisplayMinutes(totalMinutes);
  if (rounded < 60) {
    return `~${rounded}m`;
  }
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (mins === 0) {
    return `~${hours}h`;
  }
  return `~${hours}h ${mins}m`;
}
