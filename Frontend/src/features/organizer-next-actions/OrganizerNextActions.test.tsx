/**
 * PRD 364 — the "Next steps" block.
 *
 * Rendered to static markup like the other game-details cards: which rows and
 * buttons exist for which hints, the "+N more" fold, the region label, and
 * that zero hints is an empty string — not an empty card.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizerHint } from './organizerNextActionsTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key}:${Object.entries(params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
    i18n: { language: 'en-GB', resolvedLanguage: 'en-GB' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('@/components', () => ({
  Card: ({
    children,
    className: _className,
    ...rest
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div data-card {...rest}>
      {children}
    </div>
  ),
}));

const { OrganizerNextActions } = await import('./OrganizerNextActions');

const SEATS: OrganizerHint = { key: 'seats', needed: 1, waiting: 2, action: 'reviewQueue' };
const BOOKING: OrganizerHint = { key: 'booking', state: 'partial', action: 'seeBookings' };
const ATTENDANCE: OrganizerHint = {
  key: 'attendance',
  confirmed: 2,
  total: 4,
  nudgeAllowed: false,
  nudgeRemainingHours: 5,
};
const COST: OrganizerHint = { key: 'cost', unpaid: 2, action: 'review' };

function render(hints: OrganizerHint[], props: { defaultExpanded?: boolean; isNudging?: boolean } = {}) {
  return renderToStaticMarkup(
    <OrganizerNextActions hints={hints} onAction={() => undefined} {...props} />,
  );
}

describe('OrganizerNextActions', () => {
  it('renders nothing at all with zero hints', () => {
    expect(render([])).toBe('');
  });

  it('is a labelled region titled Next steps', () => {
    const html = render([SEATS]);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('organizerNextActions.title');
  });

  it('renders the seats sentence with the waiting count and a Review queue button', () => {
    const html = render([SEATS]);
    expect(html).toContain('organizerNextActions.seats.needed:count=1');
    expect(html).toContain('organizerNextActions.seats.waiting:count=2');
    expect(html).toContain('organizerNextActions.seats.reviewQueue');
    expect(html).toContain('aria-describedby=');
  });

  it('shows Invite when nobody is waiting', () => {
    const html = render([{ key: 'seats', needed: 2, waiting: 0, action: 'invite' }]);
    expect(html).toContain('organizerNextActions.seats.invite');
    expect(html).not.toContain('organizerNextActions.seats.waiting');
  });

  it('renders the booking gap with See bookings', () => {
    const html = render([BOOKING]);
    expect(html).toContain('organizerNextActions.booking.partlyBooked');
    expect(html).toContain('organizerNextActions.booking.seeBookings');
  });

  it('renders the attendance row with the PRD 346 strings, a disabled Nudge and the cooldown caption', () => {
    const html = render([ATTENDANCE]);
    expect(html).toContain('attendance.organizer.progress:confirmed=2,total=4');
    expect(html).toContain('attendance.organizer.nudge');
    expect(html).toContain('attendance.organizer.nudgeCooldown:hours=5');
    expect(html).toContain('disabled=""');
  });

  it('renders the cost row with Review, or Settle when the viewer owes', () => {
    expect(render([COST])).toContain('organizerNextActions.cost.unpaid:count=2');
    expect(render([COST])).toContain('organizerNextActions.cost.review');
    expect(render([{ ...COST, action: 'settle' }])).toContain('organizerNextActions.cost.settle');
  });

  it('shows two rows and folds the rest behind "+N more"', () => {
    const html = render([SEATS, BOOKING, ATTENDANCE, COST]);
    expect(html).toContain('data-testid="organizer-hint-seats"');
    expect(html).toContain('data-testid="organizer-hint-booking"');
    expect(html).not.toContain('data-testid="organizer-hint-attendance"');
    expect(html).not.toContain('data-testid="organizer-hint-cost"');
    expect(html).toContain('organizerNextActions.more:count=2');
    expect(html).toContain('aria-expanded="false"');
  });

  it('expands in place to show every row', () => {
    const html = render([SEATS, BOOKING, ATTENDANCE, COST], { defaultExpanded: true });
    expect(html).toContain('data-testid="organizer-hint-attendance"');
    expect(html).toContain('data-testid="organizer-hint-cost"');
    expect(html).toContain('organizerNextActions.less');
    expect(html).toContain('aria-expanded="true"');
  });

  it('has no fold control with two or fewer hints', () => {
    const html = render([SEATS, BOOKING]);
    expect(html).not.toContain('organizerNextActions.more');
    expect(html).not.toContain('aria-expanded');
  });

  it('never renders an "all done" state', () => {
    expect(render([])).not.toContain('data-card');
  });
});
