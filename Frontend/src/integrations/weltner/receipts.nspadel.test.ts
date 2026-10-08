import { describe, expect, it, vi } from 'vitest';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';

const nspadelBookings = vi.hoisted(() => vi.fn());
const weltnerBookings = vi.hoisted(() => vi.fn());
vi.mock('@/api/nspadel', () => ({ nspadelApi: { bookings: nspadelBookings } }));
vi.mock('@/api/weltner', () => ({ weltnerApi: { bookings: weltnerBookings } }));

const { loadWeltnerBookingsForClubs } = await import('./receipts');

const club = (over: Partial<ConnectedBookingClubRow>): ConnectedBookingClubRow => ({
  clubId: 'ns',
  clubName: 'NS Padel Centar',
  avatar: null,
  integrationType: 'NSPADELSUPABASE',
  connected: true,
  needsReauth: false,
  scoutOptIn: false,
  cityTimezone: 'Europe/Belgrade',
  courts: [{ id: 'court-a', name: 'Teren 1', externalCourtId: 'up-1' }],
  ...over,
});

describe('loadWeltnerBookingsForClubs — NS Padel receipts', () => {
  it('lists NS Padel receipts (no account) next to Weltner, and one failing club hides nothing else', async () => {
    nspadelBookings.mockResolvedValueOnce([
      {
        externalBookingId: 'nspadel:up-1:2030-05-05:10:00',
        referenceType: 'LOCAL_RECEIPT',
        courtId: null,
        externalCourtId: 'up-1',
        bookingStart: '2030-05-05T08:00:00.000Z',
        bookingEnd: '2030-05-05T09:00:00.000Z',
        state: 'CONFIRMED',
      },
    ]);
    weltnerBookings.mockRejectedValueOnce(new Error('down'));
    const rows = await loadWeltnerBookingsForClubs(
      [club({}), club({ clubId: 'w', clubName: 'Weltner', integrationType: 'WELTNER' })],
      'upcoming',
      Date.parse('2030-05-01T00:00:00Z'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      uuid: 'nspadel:up-1:2030-05-05:10:00',
      clubId: 'ns',
      integrationType: 'NSPADELSUPABASE',
      bookingResourceId: 'up-1',
    });
  });
});
