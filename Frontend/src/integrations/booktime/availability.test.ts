import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club, Court } from '@/types';
import {
  aggregateFreeSlotStarts,
  buildBusyByCourtId,
  buildPublicSlotsByExternalId,
  computeCourtAvailabilityRows,
  fetchBooktimeCourtAvailabilityForDate,
  filterPastSlots,
  intersectFreeSlotStarts,
} from './availability';

vi.mock('@/api/booktime', () => ({
  booktimeApi: {
    getSnapshot: vi.fn(),
  },
}));

vi.mock('@/integrations/booktime/client', () => ({
  BooktimeClient: vi.fn(),
}));

vi.mock('@/integrations/booktime/bookFlow', () => ({
  loadBooktimeCompany: vi.fn(),
}));

vi.mock('@/utils/clubAdmin/scheduleTime', () => ({
  clubLocalDateString: vi.fn(() => '2026-06-13'),
  clubLocalNowMinutes: vi.fn(() => 14 * 60),
}));

import { booktimeApi } from '@/api/booktime';
import { BooktimeClient } from '@/integrations/booktime/client';
import { loadBooktimeCompany } from '@/integrations/booktime/bookFlow';
import { clubLocalDateString, clubLocalNowMinutes } from '@/utils/clubAdmin/scheduleTime';

const club = {
  id: 'club-1',
  integrationType: 'BOOKTIME',
  integrationConfig: { companyId: 'co-1' },
  city: { timezone: 'Europe/Belgrade' },
  courts: [
    { id: 'court-a', name: 'Court A', externalCourtId: 'ext-a' },
    { id: 'court-b', name: 'Court B', externalCourtId: 'ext-b' },
  ],
} as Club;

const courts = club.courts as Court[];
const dateKey = '2026-06-13';

describe('computeCourtAvailabilityRows', () => {
  it('uses snapshot-only busy intervals when public ranges are empty', () => {
    const busy = [
      {
        startTime: '2026-06-13T10:00:00.000Z',
        endTime: '2026-06-13T11:00:00.000Z',
      },
    ];
    const raw = {
      busyByCourtId: buildBusyByCourtId([{ courtId: 'court-a', busySlots: busy }]),
      publicSlotsByExternalId: buildPublicSlotsByExternalId([]),
    };

    const rows = computeCourtAvailabilityRows({
      club,
      courts,
      raw,
      durationMinutes: 60,
      dateKey,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.freeSlots).toEqual([]);
  });

  it('computes free slots from public ranges minus snapshot busy', () => {
    const raw = {
      busyByCourtId: buildBusyByCourtId([]),
      publicSlotsByExternalId: buildPublicSlotsByExternalId([
        { uuid: 'ext-a', availableSlots: ['08:00-12:00', '14:00-18:00'] },
      ]),
    };

    const rows = computeCourtAvailabilityRows({
      club,
      courts: [courts[0]!],
      raw,
      durationMinutes: 60,
      dateKey: '2026-06-14',
    });

    expect(rows[0]?.freeSlots).toContain('08:00');
    expect(rows[0]?.freeSlots).toContain('14:00');
    expect(aggregateFreeSlotStarts(rows)).toEqual(rows[0]?.freeSlots);
  });
});

describe('filterPastSlots', () => {
  beforeEach(() => {
    vi.mocked(clubLocalDateString).mockReturnValue('2026-06-13');
    vi.mocked(clubLocalNowMinutes).mockReturnValue(14 * 60);
  });

  it('drops starts before club-local now on today', () => {
    const filtered = filterPastSlots(['08:00', '14:00', '16:00'], '2026-06-13', club);
    expect(filtered).toEqual(['14:00', '16:00']);
  });

  it('keeps all starts on non-today dates', () => {
    const filtered = filterPastSlots(['08:00', '14:00'], '2026-06-14', club);
    expect(filtered).toEqual(['08:00', '14:00']);
  });
});

describe('intersectFreeSlotStarts', () => {
  it('returns only starts shared by all selected courts', () => {
    const rows = [
      {
        court: courts[0]!,
        externalCourtId: 'ext-a',
        freeSlots: ['18:00', '19:30', '21:00'],
      },
      {
        court: courts[1]!,
        externalCourtId: 'ext-b',
        freeSlots: ['18:00', '21:00'],
      },
    ];

    expect(intersectFreeSlotStarts(rows)).toEqual(['18:00', '21:00']);
  });
});

describe('fetchBooktimeCourtAvailabilityForDate', () => {
  const getAvailableSlots = vi.fn();

  beforeEach(() => {
    vi.mocked(booktimeApi.getSnapshot).mockReset();
    vi.mocked(loadBooktimeCompany).mockReset();
    getAvailableSlots.mockReset();
    vi.mocked(BooktimeClient).mockImplementation(function MockBooktimeClient() {
      return { getAvailableSlots } as unknown as BooktimeClient;
    });
  });

  it('returns parsed raw data and company meta', async () => {
    vi.mocked(booktimeApi.getSnapshot).mockResolvedValue({
      data: {
        courts: [{ courtId: 'court-a', busySlots: [] }],
      },
    });
    getAvailableSlots.mockResolvedValue([{ uuid: 'ext-a', availableSlots: ['09:00-12:00'] }]);
    vi.mocked(loadBooktimeCompany).mockResolvedValue({
      bookingDurations: [60, 90],
      bookableDays: 21,
    });

    const result = await fetchBooktimeCourtAvailabilityForDate({
      club,
      companyId: 'co-1',
      date: new Date('2026-06-13T12:00:00'),
      loadCompanyMeta: true,
    });

    expect(result.dateKey).toBe('2026-06-13');
    expect(result.raw.publicSlotsByExternalId.get('ext-a')).toEqual(['09:00-12:00']);
    expect(result.companyMeta).toEqual({ durations: [60, 90], bookableDays: 21 });
  });

  it('propagates API errors for reload callers', async () => {
    vi.mocked(booktimeApi.getSnapshot).mockRejectedValue(new Error('network'));

    await expect(
      fetchBooktimeCourtAvailabilityForDate({
        club,
        companyId: 'co-1',
        date: new Date('2026-06-13T12:00:00'),
      })
    ).rejects.toThrow('network');
  });
});
