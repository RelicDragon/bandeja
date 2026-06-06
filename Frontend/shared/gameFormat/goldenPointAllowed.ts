/** Golden point / deuce only applies to tennis-style (CLASSIC) formats, not simple points. */
export function goldenPointAllowedForFormat(
  scoringMode: string | null | undefined,
  scoringPreset: string | null | undefined,
): boolean {
  if (scoringMode === 'POINTS') return false;
  if (scoringMode === 'CLASSIC') return true;
  return typeof scoringPreset === 'string' && scoringPreset.startsWith('CLASSIC_');
}
