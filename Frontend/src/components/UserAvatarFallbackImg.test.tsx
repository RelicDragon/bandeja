// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserAvatarFallbackImg } from './UserAvatarFallbackImg';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const SRC = 'https://cdn.example.com/u_avatar.jpg';

describe('UserAvatarFallbackImg', () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  it('calls onError only once per src', () => {
    const onError = vi.fn();
    act(() => {
      root!.render(<UserAvatarFallbackImg src={SRC} alt="" onError={onError} />);
    });
    const img = container.querySelector('img')!;
    act(() => {
      img.dispatchEvent(new Event('error'));
      img.dispatchEvent(new Event('error'));
    });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reveals a cached decoded image without waiting for a load event', () => {
    const completeDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    const widthDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get() {
        return true;
      },
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get() {
        return 64;
      },
    });
    try {
      act(() => {
        root!.render(<UserAvatarFallbackImg src={SRC} alt="" onError={() => undefined} />);
      });
      expect(container.querySelector('img')!.style.visibility).not.toBe('hidden');
    } finally {
      if (completeDesc) Object.defineProperty(HTMLImageElement.prototype, 'complete', completeDesc);
      else delete (HTMLImageElement.prototype as { complete?: boolean }).complete;
      if (widthDesc) Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', widthDesc);
      else delete (HTMLImageElement.prototype as { naturalWidth?: number }).naturalWidth;
    }
  });
});
