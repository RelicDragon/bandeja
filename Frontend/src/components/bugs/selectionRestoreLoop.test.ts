import { describe, expect, it } from 'vitest';
import { createRestoreRafLoop } from './selectionRestoreLoop';

const createRafQueue = () => {
  const pending = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  return {
    raf(callback: FrameRequestCallback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    caf(handle: number) {
      pending.delete(handle);
    },
    flush() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(0);
    },
    size() {
      return pending.size;
    },
  };
};

describe('createRestoreRafLoop', () => {
  it('restores while shouldContinue is true, then stops scheduling', () => {
    const queue = createRafQueue();
    let restoreCount = 0;
    let remaining = 2;
    const loop = createRestoreRafLoop({
      restore: () => {
        restoreCount += 1;
      },
      shouldContinue: () => {
        remaining -= 1;
        return remaining >= 0;
      },
      requestAnimationFrame: queue.raf,
      cancelAnimationFrame: queue.caf,
    });

    loop.arm();
    expect(queue.size()).toBe(1);
    queue.flush();
    queue.flush();
    queue.flush();
    expect(restoreCount).toBe(3);
    expect(queue.size()).toBe(0);
  });

  it('cancel on stop drops a queued frame', () => {
    const queue = createRafQueue();
    let restoreCount = 0;
    const loop = createRestoreRafLoop({
      restore: () => {
        restoreCount += 1;
      },
      shouldContinue: () => true,
      requestAnimationFrame: queue.raf,
      cancelAnimationFrame: queue.caf,
    });

    loop.arm();
    loop.stop();
    queue.flush();
    expect(restoreCount).toBe(0);
    expect(queue.size()).toBe(0);
  });

  it('does not schedule another frame if restore() unmounts mid-tick', () => {
    const queue = createRafQueue();
    let restoreCount = 0;
    const loop = createRestoreRafLoop({
      restore: () => {
        restoreCount += 1;
        loop.stop();
      },
      shouldContinue: () => true,
      requestAnimationFrame: queue.raf,
      cancelAnimationFrame: queue.caf,
    });

    loop.arm();
    queue.flush();
    expect(restoreCount).toBe(1);
    expect(queue.size()).toBe(0);
    queue.flush();
    expect(restoreCount).toBe(1);
  });

  it('ignores arm after stop', () => {
    const queue = createRafQueue();
    let restoreCount = 0;
    const loop = createRestoreRafLoop({
      restore: () => {
        restoreCount += 1;
      },
      shouldContinue: () => true,
      requestAnimationFrame: queue.raf,
      cancelAnimationFrame: queue.caf,
    });

    loop.stop();
    loop.arm();
    queue.flush();
    expect(restoreCount).toBe(0);
  });
});
