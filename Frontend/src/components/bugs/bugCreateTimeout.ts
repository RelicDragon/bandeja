export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let settled = false;
  return new Promise<T>((resolve, reject) => {
    const tid = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('timeout'));
    }, ms);

    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(tid);
        resolve(value);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(tid);
        reject(err);
      }
    );
  });
}
