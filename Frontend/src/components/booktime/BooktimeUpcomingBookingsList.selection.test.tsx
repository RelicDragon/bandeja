// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BooktimeUpcomingBookingsList } from './BooktimeUpcomingBookingsList';
import type { BookingListClubRow } from '@/hooks/connectedBookingClubs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), cancel: vi.fn(), genericLink: vi.fn() }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/store/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@/hooks/useBooktimeLinkedGame', () => ({ useBooktimeLinkedGame: () => ({ linkedGame: null, linkedGames: [], reload: vi.fn() }) }));
vi.mock('@/hooks/useBooktimeLinkedGamesByBookingIds', () => ({ useBooktimeLinkedGamesByBookingIds: () => ({ linkedGamesByBookingId: new Map(), loading: false, reload: vi.fn() }) }));
vi.mock('./useBooktimeClubCurrency', () => ({ useBooktimeClubCurrency: () => null }));
vi.mock('./VerifyBookingButton', () => ({ VerifyBookingButton: () => <button>Verify</button> }));
vi.mock('./BooktimeLinkGameModal', () => ({ BooktimeLinkGameButton: () => <button onClick={mocks.genericLink}>Generic link</button> }));
vi.mock('@/integrations/booking/createClubBookingProvider', () => ({ createHydratedClubBookingProvider: async () => ({ cancelBooking: mocks.cancel }) }));
vi.mock('@/components/ConfirmationModal', () => ({ ConfirmationModal: () => null }));
const club = { clubId: 'club', clubName: 'Club', integrationType: 'BOOKTIME', cityTimezone: 'Europe/Belgrade', courts: [{ id: 'court', name: 'Court', externalCourtId: 'ext' }] } as BookingListClubRow;
const first = { uuid: 'first', bookingResourceId: 'ext', bookingStart: '2030-01-06T12:00:00Z', bookingEnd: '2030-01-06T13:00:00Z' };
const second = { uuid: 'second', bookingResourceId: 'ext', bookingStart: '2030-01-06T13:00:00Z', bookingEnd: '2030-01-06T14:00:00Z' };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('booking actions in a game club picker', () => {
  it.each([false, true])('presets exactly the clicked booking without navigating (adjacent group: %s)', (grouped) => {
    const select = vi.fn();
    act(() => root.render(<BooktimeUpcomingBookingsList bookings={grouped ? [first, second] : [first]} clubById={new Map([['club', club]])} onLinkToCurrentGame={select} />));
    act(() => container.querySelector<HTMLButtonElement>(grouped ? '[data-testid="booktime-booking-group-toggle"]' : '[data-testid="booktime-booking-card-toggle"]')!.click());
    const links = [...container.querySelectorAll('button')].filter((button) => button.textContent === 'club.booktime.linkToThisGame');
    expect(links).toHaveLength(grouped ? 2 : 1);
    expect(container.textContent).toContain('club.booktime.cancelBooking');
    expect(container.textContent).toContain('Verify');
    expect(container.textContent).not.toContain('Generic link');
    expect(container.textContent).not.toContain('club.booktime.createGameHere');
    act(() => links.at(-1)!.click());
    expect(select).toHaveBeenCalledWith(grouped ? second : first);
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.genericLink).not.toHaveBeenCalled();
  });
  it('preserves generic link and create actions outside a game picker', () => {
    act(() => root.render(<BooktimeUpcomingBookingsList bookings={[first]} clubById={new Map([['club', club]])} />));
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="booktime-booking-card-toggle"]')!.click());
    expect(container.textContent).toContain('Generic link');
    expect(container.textContent).toContain('club.booktime.createGameHere');
  });
});
