/**
 * Attach extra members to a `useQuery` result **without** disabling React
 * Query's tracked-props optimisation.
 *
 * `useQuery` returns a Proxy whose `get` trap records which fields the
 * component read, and the observer only re-renders for changes to those
 * fields. Spreading that Proxy (`{ ...query, loadMore }`) reads every field,
 * so the observer tracks all of them and re-renders the caller on every
 * state tick — `fetchStatus`, `dataUpdatedAt`, `isFetching`, … — even when
 * the component only ever looked at `data`.
 *
 * This copies the result's keys as lazy getters, so a field is still only
 * tracked when somebody actually reads it.
 */
export function withQueryExtras<Q extends object, E extends object>(query: Q, extras: E): Q & E {
  // `E` is only constrained to `object`, so TypeScript will not widen a spread
  // of it to an index signature on its own.
  const out: Record<PropertyKey, unknown> = { ...(extras as Record<PropertyKey, unknown>) };
  for (const key of Object.keys(query)) {
    if (key in out) continue;
    Object.defineProperty(out, key, {
      enumerable: true,
      configurable: true,
      get: () => (query as Record<string, unknown>)[key],
    });
  }
  return out as Q & E;
}
