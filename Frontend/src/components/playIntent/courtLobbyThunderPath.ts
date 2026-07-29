/** Jagged polyline from (x1,y1) → (x2,y2) in % coords — subtle electric bolt. */
export function buildThunderPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const segments = 5;
  const pts: string[] = [`${x1.toFixed(2)},${y1.toFixed(2)}`];

  let s = seed % 997;
  const rand = () => {
    s = (s * 16807 + 7) % 2147483647;
    return (s % 1000) / 1000;
  };

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const jitter = (rand() - 0.5) * Math.min(4.2, len * 0.12);
    const midBias = Math.sin(t * Math.PI);
    const px = x1 + dx * t + nx * jitter * midBias;
    const py = y1 + dy * t + ny * jitter * midBias;
    pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  pts.push(`${x2.toFixed(2)},${y2.toFixed(2)}`);
  return `M ${pts.join(' L ')}`;
}

/** Point on the match ring edge toward the player (keeps bolt ending on the circle). */
export function pointOnMatchRing(
  playerX: number,
  playerY: number,
  cx: number,
  cy: number,
  ringRadiusPct: number,
): { x: number; y: number } {
  const dx = playerX - cx;
  const dy = (playerY - cy) / 0.88;
  const r = Math.hypot(dx, dy) || 1;
  const scale = ringRadiusPct / r;
  return {
    x: cx + dx * scale,
    y: cy + dy * scale * 0.88,
  };
}
