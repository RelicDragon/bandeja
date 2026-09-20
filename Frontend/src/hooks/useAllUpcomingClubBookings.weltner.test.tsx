// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  useAllUpcomingClubBookings,
  resetAllUpcomingClubBookingsSharedState,
} from './useAllUpcomingClubBookings';
import type { ConnectedBookingClubRow } from './connectedBookingClubs';
import type { WeltnerReceipt } from '@/api/weltner';
import { notifyBooktimeAllUpcomingCacheInvalidation } from '@/integrations/booktime/booktimeAllUpcomingCacheInvalidation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const mocks = vi.hoisted(() => ({ bookings: vi.fn(), userId: 'alice', cached: vi.fn() }));
vi.mock('@/api/weltner', () => ({ weltnerApi: { bookings: mocks.bookings } }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: mocks.userId } }),
}));
vi.mock('@/integrations/booktime/booktimeAllUpcomingLoader', () => ({
  loadAllBooktimeUpcoming: async () => [],
  peekCachedBooktimeUpcoming: mocks.cached,
  setBooktimeAllUpcomingDisplayCache: vi.fn(),
}));
vi.mock('@/integrations/padeloo/padelooAllUpcomingLoader', () => ({
  loadPadelooUpcomingForClubs: async () => [],
}));
vi.mock('@/integrations/klikteren/klikterenAllUpcomingLoader', () => ({
  loadKlikterenUpcomingForClubs: async () => [],
}));
const clubs: ConnectedBookingClubRow[] = [
  {
    clubId: 'club',
    clubName: 'Club',
    avatar: null,
    integrationType: 'WELTNER',
    connected: true,
    needsReauth: false,
    scoutOptIn: false,
    cityTimezone: 'Europe/Belgrade',
    courts: [{ id: 'court', name: 'Yucatan', externalCourtId: 'teren-1-yucatan' }],
  },
];
const receipt: WeltnerReceipt = {
  externalBookingId: 'weltner:alice',
  referenceType: 'LOCAL_RECEIPT',
  upstreamBookingId: null,
  courtId: 'court',
  bookingStart: '2099-09-21T20:00:00Z',
  bookingEnd: '2099-09-21T22:00:00Z',
  state: 'CONFIRMED',
};
let root: Root;
let result: ReturnType<typeof useAllUpcomingClubBookings>;
function Probe() {
  result = useAllUpcomingClubBookings(clubs, true);
  return null;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.userId = 'alice';
  mocks.cached.mockResolvedValue([]);
  mocks.bookings.mockResolvedValue([receipt]);
  resetAllUpcomingClubBookingsSharedState();
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  resetAllUpcomingClubBookingsSharedState();
});
it('includes confirmed Weltner receipts in the shared list even when Booktime has a cached empty list', async () => {
  mocks.bookings.mockResolvedValue([
    receipt,
    { ...receipt, externalBookingId: 'weltner:unknown', state: 'UNKNOWN' },
  ]);
  await act(async () => root.render(<Probe />));
  expect(result.bookings.map((b) => b.uuid)).toEqual(['weltner:alice']);
  expect(result.bookings[0].bookingResourceId).toBe('teren-1-yucatan');
  expect(result.bookings[0].integrationType).toBe('WELTNER');
});
it('refreshes mounted lists after booking cache invalidation', async () => {
  await act(async () => root.render(<Probe />));
  mocks.bookings.mockResolvedValue([receipt, { ...receipt, externalBookingId: 'weltner:new' }]);
  await act(async () => notifyBooktimeAllUpcomingCacheInvalidation());
  expect(result.bookings.map((b) => b.uuid)).toEqual(['weltner:alice', 'weltner:new']);
});
it('does not reuse another account’s receipts for the same connected club', async () => {
  await act(async () => root.render(<Probe />));
  mocks.userId = 'bob';
  mocks.bookings.mockResolvedValue([{ ...receipt, externalBookingId: 'weltner:bob' }]);
  await act(async () => root.render(<Probe />));
  expect(result.bookings.map((b) => b.uuid)).toEqual(['weltner:bob']);
});
it('does not let an old request overwrite the load triggered by a mutation', async () => {
  let finish!: (rows: WeltnerReceipt[]) => void;
  mocks.bookings.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(<Probe />));
  mocks.bookings.mockResolvedValue([{ ...receipt, externalBookingId: 'weltner:new' }]);
  await act(async () => notifyBooktimeAllUpcomingCacheInvalidation());
  await act(async () => finish([receipt]));
  expect(result.bookings.map((b) => b.uuid)).toEqual(['weltner:new']);
});
it('keeps past and uncertain receipts out of the upcoming list', async () => {
  mocks.bookings.mockResolvedValue([receipt, { ...receipt, externalBookingId: 'weltner:past', bookingEnd: '2000-01-01T00:00:00Z' }, { ...receipt, externalBookingId: 'weltner:pending', state: 'SUBMITTING' }]);
  await act(async () => root.render(<Probe />));
  expect(result.bookings.map(b => b.uuid)).toEqual(['weltner:alice']);
});
