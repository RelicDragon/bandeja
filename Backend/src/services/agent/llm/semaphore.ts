/** Tiny FIFO semaphore: bounds outbound LLM calls per process. Waiters honour an AbortSignal. */
export class Semaphore {
  private inUse = 0;
  private readonly waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

  constructor(private readonly limit: () => number) {}

  get active(): number {
    return this.inUse;
  }

  get waiting(): number {
    return this.waiters.length;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted');
    if (this.inUse < this.limit()) {
      this.inUse += 1;
      return this.releaser();
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        reject,
      };
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(signal?.reason ?? new Error('aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
    return this.releaser();
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        next.resolve(); // hand the slot over; inUse unchanged
      } else {
        this.inUse -= 1;
      }
    };
  }
}
