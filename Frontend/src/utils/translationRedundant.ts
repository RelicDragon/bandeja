import { canonicalizeForCompare, translationEqualsSource } from './translationOutputNormalize';

const MAX_LEN_RATIO_DELTA = 0.18;
const DICE_REDUNDANT = 0.88;
const DICE_REDUNDANT_STRICT = 0.94;
const SHORT_MAX = 12;
const DICE_SHORT = 0.97;

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  if (s.length < 2) {
    if (s.length === 1) {
      m.set(s, 1);
    }
    return m;
  }
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const n of A.values()) {
    sizeA += n;
  }
  for (const n of B.values()) {
    sizeB += n;
  }
  if (sizeA === 0 && sizeB === 0) {
    return 1;
  }
  if (sizeA === 0 || sizeB === 0) {
    return 0;
  }
  for (const [g, nA] of A) {
    const nB = B.get(g);
    if (nB) {
      overlap += Math.min(nA, nB);
    }
  }
  return (2 * overlap) / (sizeA + sizeB);
}

/** Hide near-duplicate translations that only polish the original. */
export function translationIsRedundantOfSource(source: string, translation: string): boolean {
  if (translationEqualsSource(source, translation)) {
    return true;
  }
  const s = canonicalizeForCompare(source);
  const t = canonicalizeForCompare(translation);
  if (!s || !t) {
    return false;
  }
  const lenRatio =
    Math.abs(s.length - t.length) / Math.max(s.length, t.length, 1);
  if (lenRatio > MAX_LEN_RATIO_DELTA) {
    return false;
  }
  const dice = diceCoefficient(s, t);
  const maxLen = Math.max(s.length, t.length);
  if (maxLen <= SHORT_MAX) {
    return dice >= DICE_SHORT;
  }
  const need = lenRatio > 0.08 ? DICE_REDUNDANT_STRICT : DICE_REDUNDANT;
  return dice >= need;
}
