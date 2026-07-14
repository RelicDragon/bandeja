/**
 * Available-games wire protocol (epic #280 back-compat).
 *
 * - `format=card` → new Find clients: slim card + deferred enrichment by default.
 * - No `format` (store builds / old FE) → inline notes/weather/reactions by default.
 * - Explicit `enrich=true|false|1|0` always wins.
 * Hard take ≤ 300 applies to both (busy-city safety).
 */

export const AVAILABLE_GAMES_CARD_FORMAT = 'card';

export function isAvailableCardFormat(format: unknown): boolean {
  return String(format ?? '').toLowerCase() === AVAILABLE_GAMES_CARD_FORMAT;
}

/**
 * Resolve whether the available list request should inline-enrich.
 * Legacy clients omit `format` and never call `/enrichment`.
 */
export function resolveAvailableEnrich(query: {
  format?: unknown;
  enrich?: unknown;
}): boolean {
  const raw = query.enrich;
  if (raw === true || raw === 'true' || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === '0') return false;
  // New FE: format=card → progressive enrichment endpoint.
  if (isAvailableCardFormat(query.format)) return false;
  // Old FE: restore prior inline enrich behavior.
  return true;
}
