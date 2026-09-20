// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Club, Game } from '@/types';
import { useGameLinkedBookingViewer } from './useGameLinkedBookingViewer';
import { clubToBooktimeRow } from '@/components/booktime/booktimeBookingUtils';
import { notifyBooktimeAllUpcomingCacheInvalidation } from '@/integrations/booktime/booktimeAllUpcomingCacheInvalidation';
import { LinkedBookingListItem } from '@/components/gameLocationTime/LinkedBookingListItem';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ bookings: vi.fn(), hydrate: vi.fn(), client: vi.fn(), row: vi.fn(), userId: 'player-a' as string | null }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (selector: (state: { user: { id: string } | null }) => unknown) => selector({ user: mocks.userId ? { id: mocks.userId } : null }) }));
vi.mock('@/api/weltner', () => ({ weltnerApi: { bookings: mocks.bookings } }));
vi.mock('@/integrations/booktime/session', () => ({ hydrateBooktimeSession: mocks.hydrate, getBooktimeClient: mocks.client }));
vi.mock('@/i18n/config', () => ({ default: { t: (key: string) => key } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useBooktimeLinkedGames', () => ({ useBooktimeLinkedGames: () => ({ linkedGames: [] }) }));
vi.mock('@/components/booktime/BooktimeBookingRow', () => ({ BooktimeBookingRow: (props: { club: { integrationType?: string }; trailing?: ReactNode }) => { mocks.row(props); return <div>{props.club.integrationType}{props.trailing}</div>; } }));
vi.mock('@/components/gameLocationTime/LinkedBookingAbsentModal', () => ({ LinkedBookingAbsentModal: () => null }));
vi.mock('@/api', () => ({ gamesApi: {} }));
const club: Club = { id: 'club', name: 'Club', cityId: 'city', address: '', integrationType: 'WELTNER', integrationConfig: null };
const game = { id: 'game', club, clubId: club.id, bookingStatus: 'EXTERNAL_FULL', linkedBookings: [{ id: 'link', externalBookingId: 'weltner:owned', externalBookingProvider: 'WELTNER', bookingStart: '2026-09-21T12:00:00Z', bookingEnd: '2026-09-21T13:00:00Z' }], startTime: '2026-09-21T12:00:00Z', endTime: '2026-09-21T13:00:00Z', timeIsSet: true, status: 'ANNOUNCED' } as Game;
let root: Root;
let container: HTMLDivElement;
let viewer: ReturnType<typeof useGameLinkedBookingViewer>;
function Harness({ currentGame = game }: { currentGame?: Game }) { viewer = useGameLinkedBookingViewer(currentGame); return null; }
beforeEach(() => { vi.resetAllMocks(); mocks.userId = 'player-a'; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
it('shows owned confirmed receipts without saved phone or Booktime authentication', async () => {
  mocks.bookings.mockResolvedValue([{ externalBookingId: 'weltner:owned', state: 'CONFIRMED' }]);
  await act(async () => root.render(<Harness />));
  expect(viewer.showOwnerSection).toBe(true);
  expect(viewer.showPublicCoverageBadge).toBe(false);
  expect(mocks.bookings).toHaveBeenCalledWith('club');
  expect(mocks.hydrate).not.toHaveBeenCalled();
});
it('does not grant ownership for another player or uncertain reservations', async () => {
  mocks.bookings.mockResolvedValue([{ externalBookingId: 'weltner:someone-else', state: 'CONFIRMED' }, { externalBookingId: 'weltner:owned', state: 'UNKNOWN' }]);
  await act(async () => root.render(<Harness />));
  expect(viewer.showOwnerSection).toBe(false);
  expect(viewer.showPublicCoverageBadge).toBe(true);
});
it('keeps Booktime ownership hydration unchanged', async () => {
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.client.mockReturnValue({ isAuthenticated: true, getUpcomingBookings: async () => ({ bookings: [{ uuid: 'weltner:owned' }] }), getPreviousBookings: async () => ({ bookings: [] }) });
  await act(async () => root.render(<Harness currentGame={{ ...game, club: { ...club, integrationType: 'BOOKTIME', integrationConfig: { companyId: 'company' } } }} />));
  expect(viewer.showOwnerSection).toBe(true);
  expect(mocks.hydrate).toHaveBeenCalledWith('club', 'company', undefined);
  expect(mocks.bookings).not.toHaveBeenCalled();
});
it('preserves provider routing and hides upstream refresh/missing cleanup', async () => {
  const row = clubToBooktimeRow(club);
  expect(row.integrationType).toBe('WELTNER');
  const refresh = vi.fn();
  await act(async () => root.render(<LinkedBookingListItem link={game.linkedBookings![0]} game={game} booktimeClub={row} resolvedClub={club} courts={[]} clubTimezone="Europe/Belgrade" isOwner onRefreshOwnership={refresh} readOnly />));
  expect(container.textContent).toBe('WELTNER');
  expect(container.querySelector('[data-testid="linked-booking-refresh"]')).toBeNull();
  expect(mocks.row.mock.calls[0][0].club.integrationType).toBe('WELTNER');
  expect(refresh).not.toHaveBeenCalled();
});
it('retains Padeloo and Klikteren action configuration', () => {
  expect(clubToBooktimeRow({ ...club, integrationType: 'PADELOO', integrationConfig: { clubId: 42 } })).toMatchObject({ integrationType: 'PADELOO', padelooClubId: 42 });
  expect(clubToBooktimeRow({ ...club, integrationType: 'KLIKTEREN', integrationConfig: { venueId: '550e8400-e29b-41d4-a716-446655440000' } })).toMatchObject({ integrationType: 'KLIKTEREN', klikterenVenueId: '550e8400-e29b-41d4-a716-446655440000' });
});

it('clears ownership immediately when switching accounts at the same club', async () => {
  mocks.bookings.mockResolvedValueOnce([{ externalBookingId: 'weltner:owned', state: 'CONFIRMED' }]);
  await act(async () => root.render(<Harness />));
  expect(viewer.showOwnerSection).toBe(true);
  let resolveSecond!: (rows: unknown[]) => void;
  mocks.bookings.mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
  mocks.userId = 'player-b';
  await act(async () => root.render(<Harness />));
  expect(viewer.showOwnerSection).toBe(false);
  expect(mocks.bookings).toHaveBeenCalledTimes(2);
  await act(async () => resolveSecond([]));
  expect(viewer.showOwnerSection).toBe(false);
  mocks.userId = null;
  await act(async () => root.render(<Harness />));
  expect(viewer.showOwnerSection).toBe(false);
  expect(mocks.bookings).toHaveBeenCalledTimes(2);
});
it('ignores an old account request finishing after an account switch', async () => {
  let resolveFirst!: (rows: unknown[]) => void;
  mocks.bookings.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValueOnce([]);
  await act(async () => root.render(<Harness />));
  mocks.userId = 'player-b';
  await act(async () => root.render(<Harness />));
  await act(async () => resolveFirst([{ externalBookingId: 'weltner:owned', state: 'CONFIRMED' }]));
  expect(viewer.showOwnerSection).toBe(false);
});
it('reloads receipt ownership after a booking mutation invalidates local lists', async () => {
  mocks.bookings.mockResolvedValueOnce([]).mockResolvedValueOnce([{ externalBookingId: 'weltner:owned', state: 'CONFIRMED' }]);
  await act(async () => root.render(<Harness />));
  expect(viewer.showOwnerSection).toBe(false);
  await act(async () => notifyBooktimeAllUpcomingCacheInvalidation());
  expect(viewer.showOwnerSection).toBe(true);
  expect(mocks.bookings).toHaveBeenCalledTimes(2);
});
