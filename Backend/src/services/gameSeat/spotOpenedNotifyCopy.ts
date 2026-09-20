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
  if (minLevel != null && maxLevel != null) return `${minLevel}–${maxLevel}`;
  if (minLevel != null) return `${minLevel}+`;
  if (maxLevel != null) return `≤${maxLevel}`;
  return null;
}
