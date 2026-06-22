import { describe, expect, it, vi } from 'vitest';
import {
  isMessageElementVisibleInScrollContainer,
  isMessageListNearBottom,
  pinMessageListContainerToBottom,
  pinMessageListContainerToBottomAfterLayout,
} from '../messageListScroll';

function mockScrollContainer(initial: { scrollHeight: number; clientHeight: number; scrollTop?: number }) {
  let scrollHeight = initial.scrollHeight;
  let scrollTop = initial.scrollTop ?? 0;
  const clientHeight = initial.clientHeight;
  const el = {
    get scrollHeight() {
      return scrollHeight;
    },
    get clientHeight() {
      return clientHeight;
    },
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value: number) {
      scrollTop = value;
    },
    scrollTo(opts: { top: number }) {
      scrollTop = opts.top;
    },
    growHeight(delta: number) {
      scrollHeight += delta;
    },
  } as unknown as HTMLElement;
  return { el, growHeight: (delta: number) => el.growHeight(delta) };
}

describe('messageListScroll scroll target visibility', () => {
  it('detects visible message rows in the scroll container', () => {
    const container = {
      getBoundingClientRect: () => ({ top: 100, bottom: 600, left: 0, right: 400 }),
    } as HTMLElement;
    const visible = {
      getBoundingClientRect: () => ({ top: 320, bottom: 380, left: 0, right: 400 }),
    } as HTMLElement;
    const above = {
      getBoundingClientRect: () => ({ top: 20, bottom: 80, left: 0, right: 400 }),
    } as HTMLElement;

    expect(isMessageElementVisibleInScrollContainer(container, visible)).toBe(true);
    expect(isMessageElementVisibleInScrollContainer(container, above)).toBe(false);
  });
});

describe('messageListScroll open pin', () => {
  it('pins container to visual bottom', () => {
    const { el } = mockScrollContainer({ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
    pinMessageListContainerToBottom(el);
    expect(el.scrollTop).toBe(1500);
    expect(isMessageListNearBottom(el)).toBe(true);
  });

  it('detects not near bottom when stuck at top of tall thread', () => {
    const { el } = mockScrollContainer({ scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
    expect(isMessageListNearBottom(el)).toBe(false);
  });

  it('re-pin after layout when content height grows (underestimated open paint)', async () => {
    const { el, growHeight } = mockScrollContainer({ scrollHeight: 400, clientHeight: 500, scrollTop: 0 });
    pinMessageListContainerToBottom(el);
    expect(el.scrollTop).toBe(0);
    expect(isMessageListNearBottom(el)).toBe(true);

    growHeight(1600);
    expect(isMessageListNearBottom(el)).toBe(false);
    pinMessageListContainerToBottom(el);
    expect(el.scrollTop).toBe(1500);
    expect(isMessageListNearBottom(el)).toBe(true);
  });

  it('afterLayout helper re-pins across animation frames', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'setTimeout'] });
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    };
    const { el, growHeight } = mockScrollContainer({ scrollHeight: 400, clientHeight: 500, scrollTop: 0 });
    pinMessageListContainerToBottomAfterLayout(() => el, 3);
    await vi.runAllTimersAsync();
    expect(el.scrollTop).toBe(0);

    growHeight(1600);
    pinMessageListContainerToBottomAfterLayout(() => el, 3);
    await vi.runAllTimersAsync();
    expect(el.scrollTop).toBe(1500);
    globalThis.requestAnimationFrame = raf;
    vi.useRealTimers();
  });
});
