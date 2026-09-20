/**
 * PRD 352 — the opaque cursor for `GET /rankings/pairs`. Pure, no Prisma.
 *
 * The pairs list is a *ranking*: a row's rank is its position in a total order,
 * so the cursor carries an offset into that order rather than a row id. It also
 * carries a fingerprint of the filters it was produced under — changing sort or
 * period mid-scroll must fail loudly instead of interleaving two orderings.
 */

export interface PairCursor {
  offset: number;
  fingerprint: string;
}

export interface PairCursorFilters {
  cityId: string;
  sport: string;
  period: string;
  sort: string;
}

export function pairCursorFingerprint(filters: PairCursorFilters): string {
  return `${filters.cityId}:${filters.sport}:${filters.period}:${filters.sort}`;
}

export function encodePairCursor(cursor: PairCursor): string {
  return Buffer.from(JSON.stringify([cursor.offset, cursor.fingerprint]), 'utf8').toString(
    'base64url',
  );
}

export function decodePairCursor(raw: string): PairCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [offset, fingerprint] = parsed as [unknown, unknown];
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) return null;
    if (typeof fingerprint !== 'string') return null;
    return { offset, fingerprint };
  } catch {
    return null;
  }
}
