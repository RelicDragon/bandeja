/**
 * "Use a booking I already made" in Edit → When and where: every upcoming own
 * booking is offered, the chosen one shows Undo, a long list folds, and a club
 * account that isn't connected gets one quiet row instead of nothing.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types';
import { OwnBookingsSection } from './OwnBookingsSection';
import type { OwnClubBooking } from './clubBookingClaims';
import type { OwnUpcomingClubBookings } from './useOwnClubBookings';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/booktime/ClubBookingConnectInline', () => ({
  ClubBookingConnectInline: () => <div data-testid="connect-inline" />,
}));

const club = { id: 'club1', name: 'Napolju', address: '', cityId: 'c', integrationType: 'BOOKTIME' } as Club;

function booking(id: string, day: number): OwnClubBooking {
  const start = `2026-10-${String(day).padStart(2, '0')}T17:00:00.000Z`;
  const end = `2026-10-${String(day).padStart(2, '0')}T18:30:00.000Z`;
  return { externalBookingId: id, courtId: 'c3', start, end, body: { externalBookingId: id, snapshot: {} as never } };
}

function render(own: OwnUpcomingClubBookings, pickedId: string | null = null) {
  return renderToStaticMarkup(
    <OwnBookingsSection
      club={club}
      own={own}
      pickedId={pickedId}
      courtName={() => 'Court 3'}
      formatRange={(s, e) => `${s.slice(11, 16)}–${e.slice(11, 16)}`}
      timeZone="UTC"
      locale="en-GB"
      onPick={() => {}}
      onUndo={() => {}}
    />,
  );
}

describe('OwnBookingsSection', () => {
  it('offers every upcoming booking, on any day', () => {
    const html = render({ state: 'ready', bookings: [booking('a', 12), booking('b', 15)] });
    expect(html).toContain('gameDetails.whenWhere.ownTitle');
    expect(html.match(/data-testid="schedule-own-booking"/g)).toHaveLength(2);
    expect(html).toContain('12 Oct');
    expect(html).toContain('15 Oct');
    expect(html).toContain('17:00–18:30');
  });

  it('shows the chosen booking with Undo', () => {
    const html = render({ state: 'ready', bookings: [booking('a', 12), booking('b', 15)] }, 'b');
    expect(html).toContain('schedule-own-booking-picked');
    expect(html).toContain('gameDetails.courts.clubBusyUndo');
    expect(html.match(/data-testid="schedule-own-booking"/g)).toHaveLength(1);
  });

  it('folds a long list but keeps the chosen one in view', () => {
    const bookings = [10, 11, 12, 13, 14, 15, 16].map((d) => booking(`b${d}`, d));
    const html = render({ state: 'ready', bookings }, 'b16');
    expect(html.match(/data-testid="schedule-own-booking"/g)).toHaveLength(4);
    expect(html).toContain('schedule-own-booking-picked');
    expect(html).toContain('gameDetails.whenWhere.ownMore');
  });

  it('asks to connect when the club account is not connected', () => {
    const html = render({ state: 'connect' });
    expect(html).toContain('gameDetails.whenWhere.ownConnect');
    expect(html).not.toContain('schedule-own-booking"');
  });

  it('shows nothing while loading or with no bookings', () => {
    expect(render({ state: 'loading' })).toBe('');
    expect(render({ state: 'ready', bookings: [] })).toBe('');
    expect(render({ state: 'off' })).toBe('');
  });
});
