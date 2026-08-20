export interface BookingSelectionLimits {
  min: number;
  max: number;
  playersPerCourt: number;
}

export function computeBookingSelectionLimits(
  maxParticipants: number,
  playersPerMatch: number,
): BookingSelectionLimits {
  const playersPerCourt = playersPerMatch === 2 ? 2 : 4;
  const required = Math.ceil(maxParticipants / playersPerCourt);
  return { min: required, max: required, playersPerCourt };
}

export function computeEditBookingSelectionLimits(
  maxParticipants: number,
  playersPerMatch: number,
  selectedCourtCount: number,
): BookingSelectionLimits {
  const roster = computeBookingSelectionLimits(maxParticipants, playersPerMatch);
  if (selectedCourtCount > 0) {
    const count = Math.min(Math.max(1, selectedCourtCount), roster.max);
    return { min: count, max: count, playersPerCourt: roster.playersPerCourt };
  }
  return { min: 1, max: roster.max, playersPerCourt: roster.playersPerCourt };
}
