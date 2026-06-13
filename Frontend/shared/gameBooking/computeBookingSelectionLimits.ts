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
