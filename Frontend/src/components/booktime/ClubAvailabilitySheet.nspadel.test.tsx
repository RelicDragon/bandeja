// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types';
import { ClubAvailabilitySheet } from '@/components/booktime/ClubAvailabilitySheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigateMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

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

describe('ClubAvailabilitySheet slot tap (nspadel)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigateMock.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            success: true,
            data: {
              slots: [
                { courtId: 'ext-1', courtName: 'Singles teren', startTime: '08:00', endTime: '23:00' },
                { courtId: 'ext-2', courtName: 'Doubles teren', startTime: '08:00', endTime: '23:00' },
              ],
            },
          }),
      })),
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

  it('navigates to create-game with the tapped court and time', async () => {
    await act(async () => {
      root.render(
        <ClubAvailabilitySheet
          club={club}
          selectedDate={new Date(2030, 0, 6, 12, 0, 0)}
          onDateChange={() => undefined}
          lastFetchedAt={null}
          connected
          onConnectRequest={() => undefined}
          onRefreshSnapshot={async () => true}
          enabled
        />,
      );
      for (let i = 0; i < 50 && container.querySelectorAll('button').length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Let availability rows land.
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    const buttons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === '16:00',
    );
    expect(buttons.length).toBeGreaterThan(0);
    await act(async () => {
      buttons[0]!.click();
    });
    expect(navigateMock).toHaveBeenCalledTimes(1);
    const [url, options] = navigateMock.mock.calls[0] as [string, unknown];
    expect(url).toContain('/create-game?');
    expect(url).toContain('clubId=club-ns');
    // Rows sort by court name: Doubles teren (c2) comes before Singles (c1).
    expect(url).toContain('courtId=c2');
    // The tapped wall time carries the club's UTC offset ('+' encodes as %2B).
    expect(url).toMatch(/startTime=2030-01-06T16%3A00(%2B\d\d%3A\d\d|-\d\d%3A\d\d)/);
    expect(url).toContain('startTime=2030-01-06T16%3A00');
    expect(options).toMatchObject({ state: { entityType: 'GAME' } });
  });
});
