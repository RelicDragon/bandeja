const MAX_ACTIVE_IMPORTS = 3;
const MAX_QUEUED_IMPORTS = 20;
export const GIF_IMPORT_QUEUE_WAIT_TIMEOUT_MS = 5_000;

let activeImports = 0;
type Waiter = {
  active: boolean;
  resolve: (acquired: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};
const waiters: Waiter[] = [];

export class GiphyImportBusyError extends Error {
  constructor() {
    super('GIF_IMPORT_BUSY');
    this.name = 'GiphyImportBusyError';
  }
}

async function acquire(waitTimeoutMs: number): Promise<boolean> {
  if (activeImports < MAX_ACTIVE_IMPORTS) {
    activeImports += 1;
    return true;
  }
  if (waiters.length >= MAX_QUEUED_IMPORTS) return false;
  return new Promise<boolean>((resolve) => {
    const waiter: Waiter = {
      active: true,
      resolve,
      timer: setTimeout(() => {
        waiter.active = false;
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        resolve(false);
      }, waitTimeoutMs),
    };
    waiters.push(waiter);
  });
}

function release(): void {
  while (waiters.length > 0) {
    const next = waiters.shift();
    if (!next?.active) continue;
    next.active = false;
    clearTimeout(next.timer);
    next.resolve(true);
    return;
  }
  activeImports -= 1;
}

export async function withGiphyImportSlot<T>(
  work: () => Promise<T>,
  waitTimeoutMs = GIF_IMPORT_QUEUE_WAIT_TIMEOUT_MS
): Promise<T> {
  if (!(await acquire(waitTimeoutMs))) throw new GiphyImportBusyError();
  try {
    return await work();
  } finally {
    release();
  }
}
