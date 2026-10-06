/** Club photo list edits (pure). Photos are the stored original URLs from `GET /profile`. */

/** Move the item at `from` to index `to` (clamped). Returns a new array; same array content on a no-op. */
export function movePhoto<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= list.length) return next;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return next;
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

export function removePhotoAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function samePhotoOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
