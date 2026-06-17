export function partitionMessageListNewKeys(
  keys: readonly string[],
  prev: readonly string[],
  seen: Set<string>
): { immediate: string[]; deferred: string[] } {
  const grew = keys.length > prev.length;
  const addedCount = keys.length - prev.length;
  const isPrepend = grew && prev.length > 0 && keys[0] !== prev[0];
  const isTailAppend =
    grew && !isPrepend && (addedCount === 1 || (prev.length > 0 && keys[0] === prev[0]));

  const immediate: string[] = [];
  const deferred: string[] = [];

  if (isPrepend) {
    const prependCount = keys.length - prev.length;
    for (let i = 0; i < prependCount; i++) {
      seen.add(keys[i]!);
    }
  }

  for (const key of keys) {
    if (seen.has(key)) continue;

    if (isTailAppend) {
      const idx = keys.indexOf(key);
      const isNewTail =
        (prev.length === 0 && addedCount === 1 && idx === 0) ||
        (prev.length > 0 && idx >= prev.length);
      if (isNewTail) {
        deferred.push(key);
        continue;
      }
    }

    immediate.push(key);
  }

  return { immediate, deferred };
}
