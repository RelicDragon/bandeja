/**
 * Opt-in response compaction for payloads that repeat the same related rows many times
 * (e.g. league rounds: every game carries its club, parent season and player users).
 *
 * Plain objects under one of `refProps` that carry a string `id` are stored once in
 * `refs` and replaced by `{ $ref: key }`. The key includes the property name and the
 * object's field set, so two different `select`s of the same row never merge.
 * The client reverses this with `expandCompactRefs` (Frontend `utils/compactRefs.ts`).
 */
export type CompactRefsPayload<T = unknown> = {
  compact: 1;
  refs: Record<string, unknown>;
  value: T;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function toCompactRefs(value: unknown, refProps: ReadonlySet<string>): CompactRefsPayload {
  const refs: Record<string, unknown> = {};
  const shapeIds = new Map<string, number>();

  const shapeId = (obj: Record<string, unknown>): number => {
    const sig = Object.keys(obj).sort().join(',');
    let id = shapeIds.get(sig);
    if (id === undefined) {
      id = shapeIds.size;
      shapeIds.set(sig, id);
    }
    return id;
  };

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isPlainObject(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node)) {
      if (refProps.has(key) && isPlainObject(child) && typeof child.id === 'string') {
        const refKey = `${key}:${child.id}:${shapeId(child)}`;
        if (!(refKey in refs)) {
          refs[refKey] = null;
          refs[refKey] = walk(child);
        }
        out[key] = { $ref: refKey };
      } else {
        out[key] = walk(child);
      }
    }
    return out;
  };

  return { compact: 1, refs, value: walk(value) };
}
