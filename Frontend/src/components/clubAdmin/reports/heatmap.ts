/** Heatmap model: sequential buckets (one hue, light → dark) and the visible hour span. */

export const HEAT_STEPS = [0, 20, 40, 60, 80] as const;
export const HEAT_MIX = [14, 32, 52, 74, 100] as const;

export function heatStep(pct: number): number {
  if (!(pct > 0)) return -1;
  let step = 0;
  for (let i = 0; i < HEAT_STEPS.length; i++) if (pct > HEAT_STEPS[i]) step = i;
  return step;
}

export function heatFill(step: number): string {
  if (step < 0) return 'var(--ca-sunken)';
  return `color-mix(in oklab, var(--ca-game) ${HEAT_MIX[step]}%, var(--ca-surface))`;
}

/** Hours worth showing: the span of any non-zero bucket, else 08–22. */
export function heatmapHours(heatmap: number[][]): number[] {
  let lo = 24;
  let hi = -1;
  for (const row of heatmap) {
    row.forEach((v, h) => {
      if (v > 0) {
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    });
  }
  if (hi < 0) {
    lo = 8;
    hi = 22;
  }
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

