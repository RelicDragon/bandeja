/**
 * Reverses the backend's opt-in `toCompactRefs` (Backend `utils/compactRefs.ts`):
 * `{ $ref: key }` placeholders are replaced by the shared `refs[key]` object. One
 * expanded object is shared by every place that referenced it, so treat results as
 * read-only (the same rule React state already needs).
 */
export type CompactRefsPayload<T = unknown> = {
  compact: 1;
  refs: Record<string, unknown>;
  value: T;
};

export function isCompactRefsPayload(value: unknown): value is CompactRefsPayload {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { compact?: unknown }).compact === 1 &&
    typeof (value as { refs?: unknown }).refs === 'object'
  );
}

function refKeyOf(node: unknown): string | null {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
  const ref = (node as { $ref?: unknown }).$ref;
  return typeof ref === 'string' && Object.keys(node).length === 1 ? ref : null;
}

export function expandCompactRefs<T>(payload: CompactRefsPayload): T {
  const expanded = new Map<string, unknown>();

  const resolve = (key: string): unknown => {
    if (expanded.has(key)) return expanded.get(key);
    const value = walk(payload.refs[key]);
    expanded.set(key, value);
    return value;
  };

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    const key = refKeyOf(node);
    if (key !== null) return resolve(key);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v);
    return out;
  }

  return walk(payload.value) as T;
}
