/** Race a promise against AbortSignal; rejects with AbortError when aborted. */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

/** Race a promise against a timeout (timer always cleared). */
export function withTimeout<T>(promise: Promise<T>, ms: number, code: string): Promise<T> {
  const ac = new AbortController();
  const tid = globalThis.setTimeout(() => ac.abort(), ms);
  // Swallow late settle after timeout so worker/transcode can't surface unhandled rejections.
  void promise.then(
    () => undefined,
    () => undefined
  );
  return raceAbort(promise, ac.signal)
    .catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error(code);
      }
      throw e;
    })
    .finally(() => {
      globalThis.clearTimeout(tid);
    });
}
