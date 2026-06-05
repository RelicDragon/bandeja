import crypto from 'crypto';

export type WeightedCandidate = { id: string; weight: number };

export function seededRandom(seed: string): () => number {
  let h = crypto.createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i >= h.length - 4) {
      h = crypto.createHash('sha256').update(h).digest();
      i = 0;
    }
    const n = h.readUInt32BE(i);
    i += 4;
    return n / 0xffffffff;
  };
}

export function pickHighestPriorityTier<T extends { priority: number }>(items: T[]): T[] {
  if (items.length === 0) return [];
  const maxPriority = Math.max(...items.map((i) => i.priority));
  return items.filter((i) => i.priority === maxPriority);
}

export function weightedPick(candidates: WeightedCandidate[], seed: string): string | null {
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (total <= 0) return candidates[0]?.id ?? null;

  const rand = seededRandom(seed)();
  let threshold = rand * total;
  for (const c of candidates) {
    const w = Math.max(0, c.weight);
    if (threshold < w) return c.id;
    threshold -= w;
  }
  return candidates[candidates.length - 1]?.id ?? null;
}
