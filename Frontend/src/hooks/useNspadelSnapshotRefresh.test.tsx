// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types';
import { useNspadelSnapshotRefresh } from './useNspadelSnapshotRefresh';

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
  ],
} as unknown as Club;

let fetchCalls = 0;

describe('useNspadelSnapshotRefresh', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useNspadelSnapshotRefresh> | null;

  function Probe(props: { date: Date }) {
    latest = useNspadelSnapshotRefresh(club, props.date, true);
    return null;
  }

  beforeEach(() => {
    latest = null;
    fetchCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCalls += 1;
        return {
          ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            success: true,
            data: { slots: [{ courtId: 'ext-1', startTime: '08:00', endTime: '23:00' }] },
          }),
        };
      }),
    );
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

  it('refreshes once per date and then settles (no infinite loop)', async () => {
    await act(async () => {
      root.render(<Probe date={new Date(2030, 0, 6, 12, 0, 0)} />);
      for (let i = 0; i < 50 && !latest?.lastFetchedAt; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Settle: if the hook re-triggers itself, fetches keep accumulating.
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(latest?.lastFetchedAt).not.toBeNull();
    expect(latest?.snapshotBanner).toBeNull();
    expect(latest?.isRefreshingSnapshot).toBe(false);
    expect(fetchCalls).toBe(1);
  });
});
