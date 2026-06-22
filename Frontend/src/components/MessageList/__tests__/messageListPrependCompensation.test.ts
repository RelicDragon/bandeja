import { describe, expect, it } from 'vitest';
import {
  applyPrependScrollCompensation,
  capturePrependScrollSnapshot,
  detectPrependReconcile,
} from '../messageListPrependCompensation';

function mockContainer(scrollHeight: number, scrollTop: number): HTMLElement {
  return { scrollHeight, scrollTop } as HTMLElement;
}

describe('messageListPrependCompensation', () => {
  it('capturePrependScrollSnapshot records scroll state', () => {
    const container = mockContainer(1200, 400);
    expect(capturePrependScrollSnapshot(container)).toEqual({
      scrollTop: 400,
      scrollHeight: 1200,
    });
  });

  it('applyPrependScrollCompensation shifts scrollTop by scrollHeight growth', () => {
    const container = mockContainer(1500, 400);
    const snapshot = { scrollTop: 400, scrollHeight: 1200 };
    expect(applyPrependScrollCompensation(container, snapshot)).toBe(300);
    expect(container.scrollTop).toBe(700);
  });

  it('applyPrependScrollCompensation is a no-op when height unchanged', () => {
    const container = mockContainer(1200, 400);
    const snapshot = { scrollTop: 400, scrollHeight: 1200 };
    expect(applyPrependScrollCompensation(container, snapshot)).toBe(0);
    expect(container.scrollTop).toBe(400);
  });

  it('applyPrependScrollCompensation ignores shrink (non-prepend)', () => {
    const container = mockContainer(1000, 400);
    const snapshot = { scrollTop: 400, scrollHeight: 1200 };
    expect(applyPrependScrollCompensation(container, snapshot)).toBe(0);
    expect(container.scrollTop).toBe(400);
  });

  it('detectPrependReconcile identifies socket merge prepend', () => {
    expect(
      detectPrependReconcile({
        previousMessageCount: 10,
        previousFirstId: 'm-old',
        currentFirstId: 'm-newer',
        wasLoadingMore: false,
        justLoadedOlder: false,
      })
    ).toBe(true);
  });

  it('detectPrependReconcile ignores load-more path', () => {
    expect(
      detectPrependReconcile({
        previousMessageCount: 10,
        previousFirstId: 'm-old',
        currentFirstId: 'm-newer',
        wasLoadingMore: true,
        justLoadedOlder: false,
      })
    ).toBe(false);
    expect(
      detectPrependReconcile({
        previousMessageCount: 10,
        previousFirstId: 'm-old',
        currentFirstId: 'm-newer',
        wasLoadingMore: false,
        justLoadedOlder: true,
      })
    ).toBe(false);
  });
});
