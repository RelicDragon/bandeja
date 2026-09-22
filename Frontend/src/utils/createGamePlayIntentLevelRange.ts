import { roundLevelBand } from './levelBand';

export function resolvePlayIntentCreateLevelRange(input: {
  fromPlayIntent: boolean;
  initialMin?: number | null;
  initialMax?: number | null;
  hostDefault: [number, number];
  rosterLevels?: Array<number | null | undefined>;
}): [number, number] {
  let min = input.initialMin ?? input.hostDefault[0];
  let max = input.initialMax ?? input.hostDefault[1];
  // `initialMin`/`initialMax` can come from a duplicated game carrying a
  // legacy off-grid band, so both exits snap.
  if (!input.fromPlayIntent) return roundLevelBand([min, max]);
  for (const level of input.rosterLevels ?? []) {
    if (typeof level !== 'number' || Number.isNaN(level)) continue;
    min = Math.min(min, level);
    max = Math.max(max, level);
  }
  // Roster levels are raw ratings; widening to them would put the band off the
  // slider grid, so snap before handing it back.
  return roundLevelBand([Math.max(1, min), Math.min(7, max)]);
}
