// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function makeClub(defaultSlotMinutes: number | null): Club {
  return {
    id: 'club-ns',
    name: 'NS PADEL CENTAR Novi Sad',
    openingTime: '08:00',
    closingTime: '23:00',
    integrationType: 'NSPADELSUPABASE',
    integrationConfig: { supabaseUrl: 'https://xyzcompany.supabase.co' },
    defaultSlotMinutes,
    city: { id: 'c1', name: 'Novi Sad', country: 'Serbia', timezone: 'Europe/Belgrade' },
    courts: [],
  } as unknown as Club;
}

describe('useGameTimeDuration grid step', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function tapTime(club: Club, label: string): Promise<string[]> {
    const { useGameTimeDuration } = await import('@/hooks/useGameTimeDuration');
    const { CreateGameTimeSlots } = await import('@/components/createGame/CreateGameTimeSlots');
    const React = await import('react');
    const seen: string[] = [];

    function Grid() {
      const tomorrow = React.useMemo(() => new Date(2030, 4, 6, 12, 0, 0), []);
      const {
        selectedTime,
        setSelectedTime,
        duration,
        generateTimeOptions,
        canAccommodateDuration,
        getAdjustedStartTime,
        isSlotHighlighted,
      } = useGameTimeDuration({ clubs: [club], selectedClub: club.id, initialDate: tomorrow });
      const times = generateTimeOptions();
      return React.createElement(CreateGameTimeSlots, {
        times,
        selectedTime,
        duration,
        entityType: 'GAME',
        club,
        hideOccupancyOverlay: true,
        slotsLoading: false,
        isSlotBooked: () => false,
        areAllSlotsUnconfirmed: () => false,
        hasExternallyBookedSlot: () => false,
        isSlotHardBlocked: () => false,
        canAccommodateDuration,
        getAdjustedStartTime,
        isSlotHighlighted,
        onTimeSelect: (t: string) => {
          seen.push(t);
          setSelectedTime(t);
        },
        bookedSlotInfo: null,
        getDurationLabel: (d: number) => `${d}h`,
      });
    }

    await act(async () => {
      root.render(React.createElement(Grid));
    });
    const buttons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === label,
    );
    expect(buttons.length).toBe(1);
    await act(async () => {
      buttons[0]!.click();
    });
    return seen;
  }

  it('selects the tapped wall time on a 60-minute club grid', async () => {
    expect(await tapTime(makeClub(60), '16:00')).toEqual(['16:00']);
  });

  it('keeps 30-minute club grids working unchanged', async () => {
    expect(await tapTime(makeClub(30), '16:30')).toEqual(['16:30']);
  });

  it('mirrors booktime duration-fit semantics on both grid steps', async () => {
    const { useGameTimeDuration } = await import('@/hooks/useGameTimeDuration');
    const React = await import('react');

    async function apiFor(club: Club) {
      let api: ReturnType<typeof useGameTimeDuration> | null = null;
      function Probe() {
        const hook = useGameTimeDuration({
          clubs: [club],
          selectedClub: club.id,
          initialDate: new Date(2030, 4, 6, 12, 0, 0),
        });
        api = hook;
        return null;
      }
      await act(async () => {
        root.render(React.createElement(Probe));
      });
      if (api === null) throw new Error('hook api missing');
      return api;
    }

    const hourly = await apiFor(makeClub(60));
    // Whole-hour durations fit from any visible start inside the grid.
    expect(hourly.canAccommodateDuration('16:00', 2)).toBe(true);
    expect(hourly.canAccommodateDuration('16:00', 1)).toBe(true);
    // Half-hour durations (1.5h) fit as well.
    expect(hourly.canAccommodateDuration('16:00', 1.5)).toBe(true);
    // Nothing fits past closing (23:00).
    expect(hourly.canAccommodateDuration('22:00', 2)).toBe(false);
    expect(hourly.canAccommodateDuration('22:00', 1)).toBe(true);
    // Range-filtered slots never invent sub-steps.
    expect(hourly.getTimeSlotsForDuration('16:00', 2)).toEqual(['16:00', '17:00']);
    expect(hourly.getTimeSlotsForDuration('16:00', 1.5)).toEqual(['16:00', '17:00']);
    // Adjusted start is the latest fitting start covering the tap.
    expect(hourly.getAdjustedStartTime('16:00', 2)).toBe('16:00');
    expect(hourly.getAdjustedStartTime('16:00', 1.5)).toBe('16:00');

    const halfHour = await apiFor(makeClub(30));
    expect(halfHour.canAccommodateDuration('16:30', 2)).toBe(true);
    expect(halfHour.canAccommodateDuration('21:00', 2)).toBe(true);
    expect(halfHour.canAccommodateDuration('22:00', 2)).toBe(false);
    expect(halfHour.getTimeSlotsForDuration('16:30', 1)).toEqual(['16:30', '17:00']);
    expect(halfHour.getAdjustedStartTime('16:30', 2)).toBe('16:30');
  });
});
