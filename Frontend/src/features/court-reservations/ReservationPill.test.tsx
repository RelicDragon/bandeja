// @vitest-environment jsdom

/**
 * The pill's end state never depends on animation events: they don't fire in a
 * hidden/backgrounded WebView or under reduced motion. The new label is the
 * in-flow, fully opaque content from the first render; the outgoing label is a
 * decorative aria-hidden overlay that a timeout removes even without
 * `animationend`.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reducedMotion = false;
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => reducedMotion }));

const { ReservationPill, PILL_OVERLAY_FALLBACK_MS } = await import('./ReservationPill');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const pill = () => container.querySelector<HTMLElement>('[data-reservation-tone]')!;
const overlay = () => container.querySelector<HTMLElement>('[data-pill-outgoing]');
/** Text a screen reader / layout sees: everything outside the decorative overlay. */
const inFlowText = () => {
  const clone = pill().cloneNode(true) as HTMLElement;
  clone.querySelector('[data-pill-outgoing]')?.remove();
  return clone.textContent;
};

describe('ReservationPill state change', () => {
  it('shows the new label at once and drops the old one by timeout without any animation event', () => {
    act(() => root.render(<ReservationPill tone="planned" label="Planned" />));
    expect(overlay()).toBeNull();

    act(() => root.render(<ReservationPill tone="partial" label="1 of 2 reserved" progress={0.5} />));
    expect(pill().dataset.reservationTone).toBe('partial');
    expect(inFlowText()).toBe('1 of 2 reserved');
    // No inline opacity anywhere on the in-flow content: it is opaque by default.
    expect(pill().querySelector('[style*="opacity"]')).toBeNull();
    const old = overlay();
    expect(old?.getAttribute('aria-hidden')).toBe('true');
    expect(old?.textContent).toBe('Planned');

    act(() => vi.advanceTimersByTime(PILL_OVERLAY_FALLBACK_MS));
    expect(PILL_OVERLAY_FALLBACK_MS).toBeLessThanOrEqual(250);
    expect(overlay()).toBeNull();
    expect(pill().textContent).toBe('1 of 2 reserved');
  });

  it('removes the overlay on animationend too', () => {
    act(() => root.render(<ReservationPill tone="planned" label="Planned" />));
    act(() => root.render(<ReservationPill tone="reserved" label="Reserved" />));
    const old = overlay()!;
    act(() => {
      // jsdom has no AnimationEvent, so React may listen on the prefixed name.
      for (const type of ['animationend', 'webkitAnimationEnd']) old.dispatchEvent(new Event(type, { bubbles: true }));
    });
    expect(overlay()).toBeNull();
    expect(pill().textContent).toBe('Reserved');
  });

  it('a second change replaces the overlay and still ends on the newest label', () => {
    act(() => root.render(<ReservationPill tone="planned" label="Planned" />));
    act(() => root.render(<ReservationPill tone="partial" label="1 of 2 reserved" />));
    act(() => root.render(<ReservationPill tone="reserved" label="Reserved" />));
    expect(container.querySelectorAll('[data-pill-outgoing]')).toHaveLength(1);
    expect(inFlowText()).toBe('Reserved');
    act(() => vi.advanceTimersByTime(PILL_OVERLAY_FALLBACK_MS));
    expect(overlay()).toBeNull();
  });

  it('with reduced motion it just swaps (no overlay)', () => {
    reducedMotion = true;
    act(() => root.render(<ReservationPill tone="planned" label="Planned" />));
    act(() => root.render(<ReservationPill tone="reserved" label="Reserved" />));
    expect(overlay()).toBeNull();
    expect(pill().textContent).toBe('Reserved');
  });
});
