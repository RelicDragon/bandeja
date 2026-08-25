export function shouldSeedKeysOnLayout(suppressInitialEnter: boolean, keyCount: number): boolean {
  return suppressInitialEnter && keyCount > 0;
}

export function computeVisibleNewKeys(
  keys: readonly string[],
  seen: ReadonlySet<string>,
  suppressInitialEnter: boolean
): Set<string> {
  if (suppressInitialEnter && keys.length > 0) {
    return new Set();
  }
  const next = new Set<string>();
  for (const key of keys) {
    if (!seen.has(key)) next.add(key);
  }
  return next;
}

export function nextSuppressInitialEnter(opts: {
  suppressInitialEnter: boolean;
  resetKeyChanged: boolean;
  prevListLoading: boolean;
  listLoading: boolean;
  prevNetworkSettled: boolean;
  networkSettled: boolean;
}): boolean {
  if (opts.resetKeyChanged) return true;
  if (opts.prevListLoading && !opts.listLoading) return true;
  if (!opts.prevNetworkSettled && opts.networkSettled) return true;
  return opts.suppressInitialEnter;
}
