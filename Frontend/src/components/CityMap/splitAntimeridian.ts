import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';

type Ring = Position[];

function edgeCrossesAntimeridian(a: Position, b: Position): boolean {
  return Math.abs(b[0]! - a[0]!) > 180;
}

/** Latitude where the edge hits ±180, and which side each endpoint uses. */
function antimeridianCut(a: Position, b: Position): { lat: number; aLng: number; bLng: number } {
  let bLng = b[0]!;
  if (bLng - a[0]! > 180) bLng -= 360;
  else if (bLng - a[0]! < -180) bLng += 360;

  const meridian = bLng > a[0]! ? 180 : -180;
  const t = (meridian - a[0]!) / (bLng - a[0]!);
  const lat = a[1]! + t * (b[1]! - a[1]!);

  return {
    lat,
    aLng: a[0]! > 0 ? 180 : -180,
    bLng: b[0]! > 0 ? 180 : -180,
  };
}

/**
 * Split a linear ring that crosses ±180 into closed rings that do not.
 * Fragments on the same side of the antimeridian are stitched along it.
 */
function splitRingAtAntimeridian(ring: Ring): Ring[] {
  if (ring.length < 4) return [ring];

  let crosses = false;
  for (let i = 1; i < ring.length; i++) {
    if (edgeCrossesAntimeridian(ring[i - 1]!, ring[i]!)) {
      crosses = true;
      break;
    }
  }
  if (!crosses) return [ring];

  type Frag = { side: number; pts: Position[] };
  const frags: Frag[] = [];
  let cur: Frag = { side: ring[0]![0]! >= 0 ? 1 : -1, pts: [ring[0]!] };

  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1]!;
    const curr = ring[i]!;
    if (!edgeCrossesAntimeridian(prev, curr)) {
      cur.pts.push(curr);
      continue;
    }
    const cut = antimeridianCut(prev, curr);
    cur.pts.push([cut.aLng, cut.lat]);
    frags.push(cur);
    cur = { side: curr[0]! >= 0 ? 1 : -1, pts: [[cut.bLng, cut.lat], curr] };
  }
  frags.push(cur);

  // Drop duplicate closing vertex from original ring if present on last frag
  const mergedBySide = new Map<number, Position[][]>();
  for (const frag of frags) {
    const pts = frag.pts;
    if (pts.length < 2) continue;
    const list = mergedBySide.get(frag.side) ?? [];
    list.push(pts);
    mergedBySide.set(frag.side, list);
  }

  const out: Ring[] = [];
  for (const sideFrags of mergedBySide.values()) {
    if (sideFrags.length === 0) continue;
    for (const r of stitchSideFragments(sideFrags)) {
      if (r.length >= 4) out.push(r);
    }
  }
  return out.length > 0 ? out : [ring];
}

function closeRing(pts: Position[]): Ring {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...pts, [first[0]!, first[1]!]];
  }
  return pts;
}

/** Fragments on one side arrive in ring-walk order; concatenate and close. */
function stitchSideFragments(frags: Position[][]): Ring[] {
  const pts: Position[] = [];
  for (const frag of frags) pts.push(...frag);
  return [closeRing(pts)];
}

function splitPolygonCoords(coords: Position[][]): Position[][][] {
  const out: Position[][][] = [];
  if (coords.length === 0) return out;
  const outerSplits = splitRingAtAntimeridian(coords[0]!);
  // Holes that also cross are rare; drop holes that cross for simplicity (Russia main body has none at cut)
  const holes = coords.slice(1).filter((h) => {
    for (let i = 1; i < h.length; i++) {
      if (edgeCrossesAntimeridian(h[i - 1]!, h[i]!)) return false;
    }
    return true;
  });
  for (const outer of outerSplits) {
    out.push([outer, ...holes]);
  }
  return out;
}

function splitGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    const polys = splitPolygonCoords(geometry.coordinates);
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0]! } satisfies Polygon;
    return { type: 'MultiPolygon', coordinates: polys } satisfies MultiPolygon;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys: Position[][][] = [];
    for (const poly of geometry.coordinates) {
      polys.push(...splitPolygonCoords(poly));
    }
    return { type: 'MultiPolygon', coordinates: polys } satisfies MultiPolygon;
  }
  return geometry;
}

export function splitAntimeridianFeatures<P>(
  collection: FeatureCollection<Geometry, P>
): FeatureCollection<Geometry, P> {
  return {
    type: 'FeatureCollection',
    features: collection.features.map((f: Feature<Geometry, P>) => ({
      ...f,
      geometry: splitGeometry(f.geometry),
    })),
  };
}
