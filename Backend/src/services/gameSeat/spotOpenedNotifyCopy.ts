/**
 * PRD 347 — the level fragment of the spot-opened push body
 * ("Tue 19:00 · Padel Centar · level 3.5–4.5").
 *
 * Separate from the notify service so it can be unit-tested without Prisma.
 */
export function formatLevelRange(
  minLevel: number | null,
  maxLevel: number | null,
): string | null {
  // Legacy games carry an off-grid band seeded from the host's raw rating, so
  // round at render rather than trusting the stored value.
  const lo = minLevel != null ? minLevel.toFixed(1) : null;
  const hi = maxLevel != null ? maxLevel.toFixed(1) : null;
  if (lo != null && hi != null) return `${lo}–${hi}`;
  if (lo != null) return `${lo}+`;
  if (hi != null) return `≤${hi}`;
  return null;
}
