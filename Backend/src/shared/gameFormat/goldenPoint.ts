/** null = off; 0 = GP at first 40:40; N = after N returns to deuce from advantage. */
export type DeucesBeforeGoldenPoint = number | null;

export const DEUCES_BEFORE_GOLDEN_POINT_MAX = 4;

export function isGoldenPointEnabled(threshold: DeucesBeforeGoldenPoint): boolean {
  return threshold !== null && threshold !== undefined;
}

export function isGoldenPointActive(threshold: DeucesBeforeGoldenPoint, deuceCount: number): boolean {
  if (!isGoldenPointEnabled(threshold)) return false;
  return deuceCount >= threshold!;
}

export function clampDeucesBeforeGoldenPoint(raw: unknown): DeucesBeforeGoldenPoint {
  if (raw === null || raw === undefined || raw === false) return null;
  if (raw === true) return 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const n = Math.round(raw);
  if (n < 0 || n > DEUCES_BEFORE_GOLDEN_POINT_MAX) return null;
  return n;
}

export function goldenPointEnabled(threshold: DeucesBeforeGoldenPoint): boolean {
  return isGoldenPointEnabled(threshold);
}

/** Old FE boolean: `true` meant immediate golden point at 40–40 (`deucesBeforeGoldenPoint === 0`). */
export function legacyHasGoldenPointFromDeuces(deuces: DeucesBeforeGoldenPoint): boolean {
  return deuces === 0;
}

/** Map legacy create/update `hasGoldenPoint` boolean to the new field. */
export function deucesFromLegacyHasGoldenPoint(value: unknown): DeucesBeforeGoldenPoint {
  if (value === true) return 0;
  return null;
}

export function withLegacyGoldenPointField<T extends { deucesBeforeGoldenPoint?: number | null }>(
  game: T,
): T & { hasGoldenPoint: boolean } {
  return {
    ...game,
    hasGoldenPoint: legacyHasGoldenPointFromDeuces(game.deucesBeforeGoldenPoint ?? null),
  };
}
