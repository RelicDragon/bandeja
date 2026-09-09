import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooktimeClient } from './client';

describe('BooktimeClient wire ingest timezone', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fresh verification bypasses an in-flight upcoming list request', async () => {
    const response = (uuid: string) => ({
      ok: true, status: 200, statusText: 'OK',
      text: async () => JSON.stringify({ bookings: [{
        uuid, bookingStart: '2026-06-14T18:00:00.000Z', bookingEnd: '2026-06-14T19:00:00.000Z',
      }] }),
    });
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<ReturnType<typeof response>>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response('fresh'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new BooktimeClient({ companyId: 'co-1', accessToken: 'tok' });
    const olderRequest = client.getUpcomingBookings(0, 20);
    const fresh = await client.getUpcomingBookings(1, 50, { fresh: true });
    expect(fresh.bookings[0].uuid).toBe('fresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveOld(response('old'));
    expect((await olderRequest).bookings[0].uuid).toBe('old');
  });

  it('normalizes afternoon fake-Z using clubTimeZone not Belgrade default', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            bookings: [
              {
                uuid: 'b-1',
                bookingStart: '2026-06-14T18:00:00.000Z',
                bookingEnd: '2026-06-14T19:00:00.000Z',
              },
            ],
          }),
      }),
    );

    const belgradeClient = new BooktimeClient({
      companyId: 'co-1',
      accessToken: 'tok',
      clubTimeZone: 'Europe/Belgrade',
    });
    const nycClient = new BooktimeClient({
      companyId: 'co-1',
      accessToken: 'tok',
      clubTimeZone: 'America/New_York',
    });

    const belgrade = await belgradeClient.getUpcomingBookings(0, 1);
    const nyc = await nycClient.getUpcomingBookings(0, 1);

    expect(belgrade.bookings[0]?.bookingStart).toBe('2026-06-14T16:00:00.000Z');
    expect(nyc.bookings[0]?.bookingStart).toBe('2026-06-14T22:00:00.000Z');
  });

  it('preserves price from list response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            bookings: [
              {
                uuid: 'b-1',
                bookingStart: '2026-06-14T18:00:00.000Z',
                bookingEnd: '2026-06-14T19:00:00.000Z',
                price: 4000,
                isPaid: false,
              },
            ],
          }),
      }),
    );

    const client = new BooktimeClient({
      companyId: 'co-1',
      accessToken: 'tok',
      clubTimeZone: 'Europe/Belgrade',
    });

    const page = await client.getUpcomingBookings(0, 1);
    expect(page.bookings[0]?.price).toBe(4000);
    expect(page.bookings[0]?.isPaid).toBe(false);
  });

  it('preserves price from get-previous list response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            bookings: [
              {
                uuid: 'b-past',
                bookingStart: '2026-06-14T18:00:00.000Z',
                bookingEnd: '2026-06-14T19:00:00.000Z',
                price: 3500,
              },
            ],
          }),
      }),
    );

    const client = new BooktimeClient({
      companyId: 'co-1',
      accessToken: 'tok',
      clubTimeZone: 'Europe/Belgrade',
    });

    const page = await client.getPreviousBookings(0, 1);
    expect(page.bookings[0]?.price).toBe(3500);
  });

  it('setClubTimeZone updates ingest for subsequent fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          bookings: [
            {
              uuid: 'b-1',
              bookingStart: '2026-06-14T18:00:00.000Z',
              bookingEnd: '2026-06-14T19:00:00.000Z',
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new BooktimeClient({
      companyId: 'co-1',
      accessToken: 'tok',
    });
    const first = await client.getUpcomingBookings(0, 1);
    expect(first.bookings[0]?.bookingStart).toBe('2026-06-14T16:00:00.000Z');

    client.setClubTimeZone('America/New_York');
    const second = await client.getUpcomingBookings(0, 1);
    expect(second.bookings[0]?.bookingStart).toBe('2026-06-14T22:00:00.000Z');
  });
});
