export function resolvePlayIntentCreateLevelRange(input: {
  fromPlayIntent: boolean;
  initialMin?: number | null;
  initialMax?: number | null;
  hostDefault: [number, number];
  rosterLevels?: Array<number | null | undefined>;
}): [number, number] {
  let min = input.initialMin ?? input.hostDefault[0];
  let max = input.initialMax ?? input.hostDefault[1];
  if (!input.fromPlayIntent) return [min, max];
  for (const level of input.rosterLevels ?? []) {
    if (typeof level !== 'number' || Number.isNaN(level)) continue;
    min = Math.min(min, level);
    max = Math.max(max, level);
  }
  return [Math.max(1, min), Math.min(7, max)];
}
