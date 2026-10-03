/**
 * PRD 364 — the "Next steps" block.
 *
 * Rendered to static markup like the other game-details cards: which rows and
 * buttons exist for which hints, the lead step, the progress rings, the region label, and
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
const { organizerHintProgress } = await import('./organizerNextActionsCopy');

const SEATS: OrganizerHint = {
  key: 'seats',
  needed: 1,
  capacity: 4,
  waiting: 2,
  action: 'reviewQueue',
};
const BOOKING: OrganizerHint = { key: 'booking', state: 'partial', action: 'seeBookings' };
const ATTENDANCE: OrganizerHint = {
  key: 'attendance',
  confirmed: 2,
  total: 4,
  nudgeAllowed: false,
  nudgeRemainingHours: 5,
};
const COST: OrganizerHint = { key: 'cost', unpaid: 2, action: 'review' };

function render(hints: OrganizerHint[], props: { isNudging?: boolean } = {}) {
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
  });

  it('shows Invite when nobody is waiting', () => {
    const html = render([{ key: 'seats', needed: 2, capacity: 4, waiting: 0, action: 'invite' }]);
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

  it('shows every step with no fold, each as one button', () => {
    const html = render([SEATS, BOOKING, ATTENDANCE, COST]);
    for (const key of ['seats', 'booking', 'attendance', 'cost']) {
      expect(html).toContain(`data-testid="organizer-hint-${key}"`);
    }
    expect(html).not.toContain('aria-expanded');
    expect(html.match(/<button/g)?.length).toBe(4);
  });

  it('leads with the first step: the only filled action pill', () => {
    const html = render([BOOKING, COST]);
    expect(html.match(/bg-primary-600/g)?.length).toBe(1);
    expect(html.indexOf('bg-primary-600')).toBeLessThan(html.indexOf('organizer-hint-cost'));
  });

  it('does not lead with a disabled step', () => {
    expect(render([ATTENDANCE])).not.toContain('bg-primary-600');
  });

  it('shows the count of open steps', () => {
    expect(render([SEATS, BOOKING, COST])).toMatch(/tabular-nums[^>]*>3</);
  });

  it('never renders an "all done" state', () => {
    expect(render([])).not.toContain('data-card');
  });
});

describe('organizerHintProgress', () => {
  it('fills seats taken out of capacity and confirmed out of playing', () => {
    expect(organizerHintProgress(SEATS)).toBe(0.75);
    expect(organizerHintProgress(ATTENDANCE)).toBe(0.5);
  });

  it('reads booking as empty or half, and cost has no ring', () => {
    expect(organizerHintProgress({ key: 'booking', state: 'none', action: 'editCourt' })).toBe(0);
    expect(organizerHintProgress(BOOKING)).toBe(0.5);
    expect(organizerHintProgress(COST)).toBeNull();
  });
});
