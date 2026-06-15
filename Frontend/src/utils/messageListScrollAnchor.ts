export type MeasurementSnapshot = ReadonlyArray<{ start: number; size: number }>;

export function snapshotMeasurements(
  measurements: ReadonlyArray<{ start: number; size: number }>
): MeasurementSnapshot {
  return measurements.map((m) => ({ start: m.start, size: m.size }));
}

/** Sum size deltas for rows whose top edge is above the scroll offset (TanStack rule). */
export function sumSizeDeltaAboveScrollTop(
  prev: MeasurementSnapshot,
  next: MeasurementSnapshot,
  scrollTop: number
): number {
  const len = Math.min(prev.length, next.length);
  let delta = 0;
  for (let i = 0; i < len; i++) {
    const p = prev[i];
    const n = next[i];
    if (!p || !n || p.size === n.size) continue;
    if (p.start < scrollTop) {
      delta += n.size - p.size;
    }
  }
  return delta;
}
