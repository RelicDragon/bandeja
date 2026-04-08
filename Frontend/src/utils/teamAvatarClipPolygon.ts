const EPS = 1e-6;

function addUnique(verts: [number, number][], p: [number, number]) {
  if (
    !verts.some(([x, y]) => Math.abs(x - p[0]) < EPS && Math.abs(y - p[1]) < EPS)
  ) {
    verts.push([Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]);
  }
}

/** Half of a 100%×100% box split by a line through center; used as CSS clip-path. */
export function teamAvatarHalfPlaneClipPath(angleDeg: number, side: 'first' | 'second'): string {
  const rad = (angleDeg * Math.PI) / 180;
  const nx = -Math.sin(rad);
  const ny = Math.cos(rad);
  const cx = 50;
  const cy = 50;
  const inHalf = (x: number, y: number) => {
    const d = nx * (x - cx) + ny * (y - cy);
    return side === 'first' ? d >= -EPS : d <= EPS;
  };

  const verts: [number, number][] = [];
  const corners: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  for (const [x, y] of corners) {
    if (inHalf(x, y)) addUnique(verts, [x, y]);
  }

  const K = nx * cx + ny * cy;
  if (Math.abs(ny) > EPS) {
    let y = K / ny;
    if (y >= -EPS && y <= 100 + EPS) addUnique(verts, [0, Math.max(0, Math.min(100, y))]);
    y = (K - nx * 100) / ny;
    if (y >= -EPS && y <= 100 + EPS) addUnique(verts, [100, Math.max(0, Math.min(100, y))]);
  }
  if (Math.abs(nx) > EPS) {
    let x = K / nx;
    if (x >= -EPS && x <= 100 + EPS) addUnique(verts, [Math.max(0, Math.min(100, x)), 0]);
    x = (K - ny * 100) / nx;
    if (x >= -EPS && x <= 100 + EPS) addUnique(verts, [Math.max(0, Math.min(100, x)), 100]);
  }

  if (verts.length < 3) {
    return side === 'first'
      ? 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
      : 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
  }

  const mx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
  const my = verts.reduce((s, v) => s + v[1], 0) / verts.length;
  verts.sort(
    (a, b) => Math.atan2(a[1] - my, a[0] - mx) - Math.atan2(b[1] - my, b[0] - mx)
  );

  return `polygon(${verts.map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
}
