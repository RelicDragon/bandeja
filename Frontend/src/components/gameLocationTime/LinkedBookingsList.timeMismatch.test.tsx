// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => {
  const t = (key: string) => key;
  return {
    useTranslation: () => ({ t, i18n: { language: 'en' } }),
    initReactI18next: { type: '3rdParty', init: () => {} },
  };
});

vi.mock('@/hooks/useBooktimeUserBookingIds', () => ({
  useBooktimeUserBookingIds: () => ({ isOwner: () => false, reload: vi.fn(), loading: false }),
}));

vi.mock('@/hooks/useBooktimeLinkedGames', () => ({
  useBooktimeLinkedGames: () => ({ linkedGames: [] }),
}));

vi.mock('@/components/booktime/BooktimeBookingRow', () => ({
  BooktimeBookingRow: ({ booking, nested }: { booking: { uuid: string }; nested?: boolean }) =>
    nested ? (
      <div data-testid="booking-row">{booking.uuid}</div>
    ) : (
      <li data-testid="booking-row">{booking.uuid}</li>
    ),
}));

import { LinkedBookingsList } from './LinkedBookingsList';

/**
 * Time change — a linked booking the game has moved away from is flagged on
 * its own row. The app never moves the reservation; the organizer does.
 */

const club = {
  id: 'club1',
  name: 'Club',
  integrationType: 'BOOKTIME',
  integrationConfig: { companyId: 'co1' },
  city: { timezone: 'UTC' },
};

function gameWith(startTime: string, endTime: string): Game {
  return {
    id: 'g1',
    startTime,
    endTime,
    timeIsSet: true,
    maxParticipants: 4,
    club,
    clubId: 'club1',
    linkedBookings: [
      {
        id: 'l1',
        externalBookingId: 'b1',
        externalBookingProvider: 'BOOKTIME',
        bookingStart: '2026-06-12T10:00:00.000Z',
        bookingEnd: '2026-06-12T12:00:00.000Z',
      },
    ],
  } as unknown as Game;
}

describe('LinkedBookingsList time mismatch', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows no flag while the booking covers the game', () => {
    act(() => {
      root.render(<LinkedBookingsList game={gameWith('2026-06-12T10:00:00.000Z', '2026-06-12T12:00:00.000Z')} readOnly />);
    });
    expect(container.querySelector('[data-testid="booking-row"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="linked-booking-needs-attention"]')).toBeNull();
    expect(container.textContent).not.toContain('gameDetails.linkedBookings.timeMismatch');
  });

  it('flags the booking after the game moved', () => {
    act(() => {
      root.render(<LinkedBookingsList game={gameWith('2026-06-12T15:00:00.000Z', '2026-06-12T17:00:00.000Z')} readOnly />);
    });
    const flagged = container.querySelector('[data-testid="linked-booking-needs-attention"]');
    expect(flagged).not.toBeNull();
    expect(flagged?.tagName).toBe('LI');
    expect(flagged?.textContent).toContain('b1');
    expect(flagged?.textContent).toContain('gameDetails.linkedBookings.timeMismatch');
  });
});
