/**
 * The busy-court card asks only when it cannot check: their own reservation is
 * offered for linking, someone else's is called so, and marking reserved is
 * never the main action.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ClubBookingClaimCard } from './ClubBookingClaimCard';
import type { ClubBookingConflict, ClubBookingVerdict, OwnClubBooking } from './clubBookingClaims';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const conflict: ClubBookingConflict = { courtId: 'c4', start: '2026-10-13T07:00:00.000Z', end: '2026-10-13T09:00:00.000Z' };
const booking: OwnClubBooking = {
  externalBookingId: 'b1',
  courtId: 'c4',
  start: conflict.start,
  end: conflict.end,
  body: { externalBookingId: 'b1', snapshot: {} as never },
};

function render(verdict: ClubBookingVerdict, extra: Partial<Parameters<typeof ClubBookingClaimCard>[0]> = {}) {
  return renderToStaticMarkup(
    <ClubBookingClaimCard
      open={[conflict]}
      claimed={[]}
      courtName={() => 'Court 4'}
      formatTime={(iso) => iso.slice(11, 16)}
      verdictOf={() => verdict}
      providerName="Booktime"
      onClaim={() => {}}
      onUndo={() => {}}
      onUseOwn={() => {}}
      {...extra}
    />,
  );
}

describe('ClubBookingClaimCard', () => {
  it('own reservation: offers linking it, not marking', () => {
    const html = render({ kind: 'own', booking });
    expect(html).toContain('data-verdict="own"');
    expect(html).toContain('gameDetails.courts.clubBusyOwnFound');
    expect(html).toContain('gameDetails.courts.clubBusyUseOwn');
    expect(html).not.toContain('gameDetails.courts.clubBusyMine<');
  });

  it("not in their account: someone else's; claiming is only a text link", () => {
    const html = render({ kind: 'notInAccount' });
    expect(html).toContain('gameDetails.courts.clubBusyNotInAccount');
    expect(html).toContain('gameDetails.courts.clubBusyMineOtherWay');
    expect(html).not.toContain('gameDetails.courts.clubBusyUseOwn');
  });

  it("can't check: outlined \"I booked it myself\"", () => {
    const html = render({ kind: 'unknown' });
    expect(html).toContain('gameDetails.courts.clubBusyElse');
    expect(html).toContain('gameDetails.courts.clubBusyMine');
  });

  it('chosen own booking shows as a green linked row; a mark shows sky', () => {
    const linked = render({ kind: 'own', booking }, { open: [], linked: [{ conflict, booking }] });
    expect(linked).toContain('data-testid="club-booking-linked"');
    expect(linked).toContain('emerald');
    const marked = render({ kind: 'unknown' }, { open: [], claimed: [conflict] });
    expect(marked).toContain('data-testid="club-booking-claimed"');
    expect(marked).toContain('sky');
  });
});
