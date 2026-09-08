// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types';
import { useNspadelAvailability } from './useNspadelAvailability';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const club = {
  id: 'club-ns',
  name: 'NS PADEL CENTAR Novi Sad',
  openingTime: '08:00',
  closingTime: '23:00',
  integrationType: 'NSPADELSUPABASE',
  integrationConfig: { supabaseUrl: 'https://xyzcompany.supabase.co' },
  courts: [
    { id: 'c1', clubId: 'club-ns', name: 'Singles teren', externalCourtId: 'ext-1', isIndoor: false },
    { id: 'c2', clubId: 'club-ns', name: 'Doubles teren', externalCourtId: 'ext-2', isIndoor: false },
  ],
} as unknown as Club;

function mockAvailabilityFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const href = String(url);
      if (!href.includes('/nspadel/availability')) {
        throw new Error(`unexpected fetch: ${href}`);
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            success: true,
            data: {
              slots: [
                { courtId: 'ext-1', courtName: 'Singles teren', startTime: '08:00', endTime: '12:00' },
                { courtId: 'ext-1', courtName: 'Singles teren', startTime: '13:00', endTime: '23:00' },
                { courtId: 'ext-2', courtName: 'Doubles teren', startTime: '08:00', endTime: '23:00' },
              ],
            },
          }),
      };
    }),
  );
}

describe('useNspadelAvailability', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useNspadelAvailability> | null;

  function Probe(props: { date: Date }) {
    latest = useNspadelAvailability(club, props.date, true);
    return null;
  }

  beforeEach(() => {
    latest = null;
    mockAvailabilityFetch();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('loads free slots per court from the backend availability endpoint', async () => {
    await act(async () => {
      root.render(<Probe date={new Date(2030, 0, 6, 12, 0, 0)} />);
      for (let i = 0; i < 50 && (!latest || latest.loading || latest.courtRows.length === 0); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    });

    expect(latest).not.toBeNull();
    expect(latest!.error).toBeNull();
    expect(latest!.durations).toEqual([60, 90, 120]);
    expect(latest!.courtRows.map((row) => row.court.id)).toEqual(['c2', 'c1']);
    const singles = latest!.courtRows.find((row) => row.court.id === 'c1')!;
    // Busy 12:00-13:00 cuts the grid: 11:00 free (ends 12:00), 11:30/12:00/12:30 blocked.
    expect(singles.freeSlots).toContain('08:00');
    expect(singles.freeSlots).toContain('11:00');
    expect(singles.freeSlots).not.toContain('11:30');
    expect(singles.freeSlots).not.toContain('12:00');
    expect(singles.freeSlots).not.toContain('12:30');
    expect(singles.freeSlots).toContain('13:00');
    const doubles = latest!.courtRows.find((row) => row.court.id === 'c2')!;
    expect(doubles.freeSlots[0]).toBe('08:00');
    expect(doubles.freeSlots[doubles.freeSlots.length - 1]).toBe('22:00');
  });
});
