export type SportOverlayFields = {
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
  approvedLevel: boolean;
  approvedById: string | null;
  approvedWhen: Date | string | null;
};

export function overlaySportProjection<T extends Record<string, unknown>>(
  user: T,
  overlay: SportOverlayFields,
): Omit<T, 'sportProfiles'> & SportOverlayFields {
  const rest = { ...user } as T & { sportProfiles?: unknown };
  delete rest.sportProfiles;
  return {
    ...rest,
    ...overlay,
  } as Omit<T, 'sportProfiles'> & SportOverlayFields;
}
