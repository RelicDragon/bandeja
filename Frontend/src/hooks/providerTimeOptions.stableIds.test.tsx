// @vitest-environment jsdom

/**
 * Regression: picking a specific court in the create wizard crashed the page
 * ("Maximum update depth exceeded") because the caller passed a fresh
 * `selectedCourtIds` array each render and the disabled Padeloo/Klikteren hooks
 * answered every new array with `setOptions([])`. The hooks must settle even
 * when the caller's array identity changes on every render.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { usePadelooTimeOptions } from './usePadelooTimeOptions';
import { useKlikterenTimeOptions } from './useKlikterenTimeOptions';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const date = new Date('2026-10-10T10:00:00Z');

describe.each([
  ['usePadelooTimeOptions', usePadelooTimeOptions],
  ['useKlikterenTimeOptions', useKlikterenTimeOptions],
] as const)('%s with a fresh court-id array every render', (_name, useHook) => {
  it('settles instead of re-rendering forever', async () => {
    let renders = 0;
    function Probe() {
      renders += 1;
      useHook({
        club: undefined,
        courts: [],
        selectedDate: date,
        durationHours: 1.5,
        selectedCourtId: null,
        selectedCourtIds: ['court-2'],
        enabled: false,
      });
      return null;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    expect(renders).toBeLessThan(10);
    act(() => root.unmount());
  }, 5000);
});
