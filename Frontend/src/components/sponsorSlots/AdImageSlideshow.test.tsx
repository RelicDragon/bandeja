// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdImageSlideshow } from './AdImageSlideshow';

let reduceMotion = false;

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => reduceMotion,
}));

describe('AdImageSlideshow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    reduceMotion = false;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('advances through an ordered image set', () => {
    act(() => root.render(<AdImageSlideshow frames={['one.webp', 'two.webp']} alt="Ad" />));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('one.webp');

    act(() => vi.advanceTimersByTime(6000));

    expect(Array.from(container.querySelectorAll('img')).some((img) => img.getAttribute('src') === 'two.webp')).toBe(true);
  });

  it('renders only frame zero when reduced motion is requested', () => {
    reduceMotion = true;
    act(() => root.render(<AdImageSlideshow frames={['one.webp', 'two.webp']} alt="Ad" />));

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('one.webp');
  });
});
