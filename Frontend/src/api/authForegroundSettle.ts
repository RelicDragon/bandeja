let foregroundSettlement: Promise<unknown> | null = null;

export function runForegroundAuthSettle<T>(factory: () => Promise<T>): Promise<T> {
  if (!foregroundSettlement) {
    const run = factory();
    foregroundSettlement = run.finally(() => {
      foregroundSettlement = null;
    });
  }
  return foregroundSettlement as Promise<T>;
}

/** Wait for an in-flight tab-resume auth settle before treating 401 as terminal. */
export function awaitAuthForegroundSettle(): Promise<void> {
  const pending = foregroundSettlement;
  if (!pending) return Promise.resolve();
  return pending.then(() => undefined);
}
