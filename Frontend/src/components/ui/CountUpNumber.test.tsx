// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => motion.reduced,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));

import { CountUpNumber } from './CountUpNumber';

let container: HTMLDivElement;
let root: Root;
let frames: Map<number, FrameRequestCallback>;
let cancelled: number[];
let nextFrameId: number;
let clock: number;

function runNextFrame(at: number): void {
  clock = at;
  const [id, callback] = [...frames.entries()][0];
  frames.delete(id);
  act(() => callback(at));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  motion.reduced = false;
  frames = new Map();
  cancelled = [];
  nextFrameId = 0;
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    nextFrameId += 1;
    frames.set(nextFrameId, callback);
    return nextFrameId;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    cancelled.push(id);
    frames.delete(id);
  });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe('CountUpNumber', () => {
  it('jumps straight to the value under reduced motion', () => {
    motion.reduced = true;
    act(() => root.render(<CountUpNumber value={1234} />));
    expect(container.textContent).toBe('1,234');
    expect(frames.size).toBe(0);

    act(() => root.render(<CountUpNumber value={2000} />));
    expect(container.textContent).toBe('2,000');
    expect(frames.size).toBe(0);
  });

  it('formats through Intl for the active locale, honouring decimals', () => {
    motion.reduced = true;
    act(() => root.render(<CountUpNumber value={1234.567} decimals={2} />));
    expect(container.textContent).toBe('1,234.57');
  });

  it('uses a custom formatter when given', () => {
    motion.reduced = true;
    act(() => root.render(<CountUpNumber value={7} format={(n) => `${n} €`} />));
    expect(container.textContent).toBe('7 €');
  });

  it('animates towards the value and clamps the duration to 600 ms', () => {
    act(() => root.render(<CountUpNumber value={0} />));
    act(() => root.render(<CountUpNumber value={100} durationMs={5000} />));
    expect(frames.size).toBe(1);

    runNextFrame(300);
    const midway = Number(container.textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(100);

    // 5000 ms was clamped to 600 ms, so the animation is over by then.
    runNextFrame(600);
    expect(container.textContent).toBe('100');
    expect(frames.size).toBe(0);
  });

  it('re-targets from the displayed value when the target changes mid-flight', () => {
    act(() => root.render(<CountUpNumber value={0} />));
    act(() => root.render(<CountUpNumber value={100} />));
    runNextFrame(300);
    const midway = Number(container.textContent);

    act(() => root.render(<CountUpNumber value={200} />));
    expect(cancelled.length).toBeGreaterThan(0);
    expect(frames.size).toBe(1);

    runNextFrame(310);
    // Continues upward from where it was, never snapping back to zero.
    expect(Number(container.textContent)).toBeGreaterThanOrEqual(midway);
  });

  it('cancels the pending frame on unmount', () => {
    act(() => root.render(<CountUpNumber value={0} />));
    act(() => root.render(<CountUpNumber value={50} />));
    expect(frames.size).toBe(1);

    act(() => root.unmount());
    expect(frames.size).toBe(0);
    expect(cancelled.length).toBeGreaterThan(0);

    // afterEach unmounts again; make that a no-op.
    root = createRoot(document.createElement('div'));
  });
});
