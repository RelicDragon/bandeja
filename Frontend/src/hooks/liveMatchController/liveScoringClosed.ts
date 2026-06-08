export function liveScoringClosedByMatchMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const o = metadata as { nonRallyOutcome?: unknown };
  const v = o.nonRallyOutcome;
  return v === 'WALKOVER' || v === 'DEFAULT' || v === 'RETIRED';
}
