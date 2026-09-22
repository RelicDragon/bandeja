/**
 * PRD 364 — the hint resolver, as a fixture matrix.
 *
 * Seats open × queue × booking coverage × attendance × cost × role ×
 * resultsStatus. The assertions that matter most: order, the cap of two
 * visible rows, "FINAL shows cost only", "a participant gets nothing", and
 * "a fact without a possible action is not a hint".
 */
import { describe, expect, it } from 'vitest';
import { buildOrganizerNextActions, splitOrganizerHints } from './buildOrganizerNextActions';
import type {
  OrganizerAttendanceInput,
  OrganizerNextActionsInput,
  OrganizerViewerRole,
} from './organizerNextActionsTypes';

function playing(n: number) {
  return Array.from({ length: n }, () => ({ status: 'PLAYING' }));
}

const OPEN_ATTENDANCE: OrganizerAttendanceInput = {
  enabled: true,
  answersOpen: true,
  confirmedCount: 2,
  playingCount: 4,
  nudgeAllowed: true,
  nudgeRemainingHours: 0,
};

function input(overrides: Partial<OrganizerNextActionsInput> = {}): OrganizerNextActionsInput {
  return {
    game: {
      entityType: 'GAME',
      status: 'ANNOUNCED',
      resultsStatus: 'NONE',
      timeIsSet: true,
      maxParticipants: 4,
      participants: playing(3),
      joinQueues: [],
      hasClub: true,
      linkedBookingCount: 0,
    },
    viewerRole: 'organizer',
    canInvite: true,
    canManageQueue: true,
    attendance: OPEN_ATTENDANCE,
    bookingCoverage: 'none',
    cost: { unpaidCount: 2, viewerOwesUnpaid: false },
    ...overrides,
  };
}

const keys = (i: OrganizerNextActionsInput) => buildOrganizerNextActions(i).map((h) => h.key);

describe('buildOrganizerNextActions — order and cap', () => {
  it('lists seats → booking → attendance → cost before results', () => {
    expect(keys(input())).toEqual(['seats', 'booking', 'attendance', 'cost']);
  });

  it('keeps two rows visible and folds the rest', () => {
    const hints = buildOrganizerNextActions(input());
    const { visible, hidden } = splitOrganizerHints(hints, false);
    expect(visible.map((h) => h.key)).toEqual(['seats', 'booking']);
    expect(hidden.map((h) => h.key)).toEqual(['attendance', 'cost']);
    expect(splitOrganizerHints(hints, true).hidden).toEqual([]);
  });

  it('never has more than four hints', () => {
    expect(buildOrganizerNextActions(input()).length).toBeLessThanOrEqual(4);
  });
});

describe('buildOrganizerNextActions — seats', () => {
  it('counts only PLAYING seats', () => {
    const i = input({
      game: {
        ...input().game,
        participants: [
          ...playing(2),
          { status: 'IN_QUEUE' },
          { status: 'INVITED' },
          { status: 'NON_PLAYING' },
        ],
      },
    });
    const [seats] = buildOrganizerNextActions(i);
    expect(seats).toMatchObject({ key: 'seats', needed: 2, waiting: 0, action: 'invite' });
  });

  it('offers Review queue when people are waiting and the viewer manages the queue', () => {
    const i = input({ game: { ...input().game, joinQueues: [{}, {}] } });
    expect(buildOrganizerNextActions(i)[0]).toMatchObject({
      key: 'seats',
      needed: 1,
      waiting: 2,
      action: 'reviewQueue',
    });
  });

  it('falls back to Invite when the viewer cannot manage the queue', () => {
    const i = input({ game: { ...input().game, joinQueues: [{}] }, canManageQueue: false });
    expect(buildOrganizerNextActions(i)[0]).toMatchObject({ key: 'seats', waiting: 1, action: 'invite' });
  });

  it('drops the seats fact when no action is possible', () => {
    const i = input({ canInvite: false, canManageQueue: false });
    expect(keys(i)).not.toContain('seats');
  });

  it('has no seats hint when the roster is full', () => {
    expect(keys(input({ game: { ...input().game, participants: playing(4) } }))).not.toContain('seats');
  });

  it('never asks for seats on an unbounded BAR roster', () => {
    const i = input({ game: { ...input().game, entityType: 'BAR', participants: playing(1) } });
    expect(keys(i)).not.toContain('seats');
  });
});

describe('buildOrganizerNextActions — booking', () => {
  it('reads "not booked" as a gap that opens the court editor when nothing is linked', () => {
    const booking = buildOrganizerNextActions(input()).find((h) => h.key === 'booking');
    expect(booking).toMatchObject({ key: 'booking', state: 'none', action: 'editCourt' });
  });

  it('sends the organizer to the bookings section when links exist but cover nothing', () => {
    const i = input({ game: { ...input().game, linkedBookingCount: 1 } });
    expect(buildOrganizerNextActions(i).find((h) => h.key === 'booking')).toMatchObject({
      state: 'none',
      action: 'seeBookings',
    });
  });

  it('reads partial coverage as "partly booked"', () => {
    const i = input({ bookingCoverage: 'external_partial', game: { ...input().game, linkedBookingCount: 1 } });
    expect(buildOrganizerNextActions(i).find((h) => h.key === 'booking')).toMatchObject({
      state: 'partial',
      action: 'seeBookings',
    });
  });

  it.each(['manual', 'external_full'] as const)('is silent when coverage is %s', (coverage) => {
    expect(keys(input({ bookingCoverage: coverage }))).not.toContain('booking');
  });

  it('is silent without a time, without a club, or without the booking capability', () => {
    expect(keys(input({ game: { ...input().game, timeIsSet: false } }))).not.toContain('booking');
    expect(keys(input({ game: { ...input().game, hasClub: false } }))).not.toContain('booking');
    expect(keys(input({ game: { ...input().game, entityType: 'BAR' } }))).not.toContain('booking');
    expect(keys(input({ bookingCoverage: null }))).not.toContain('booking');
  });
});

describe('buildOrganizerNextActions — attendance', () => {
  it('carries the confirmed count and the nudge state', () => {
    const attendance = buildOrganizerNextActions(
      input({ attendance: { ...OPEN_ATTENDANCE, nudgeAllowed: false, nudgeRemainingHours: 5 } }),
    ).find((h) => h.key === 'attendance');
    expect(attendance).toEqual({
      key: 'attendance',
      confirmed: 2,
      total: 4,
      nudgeAllowed: false,
      nudgeRemainingHours: 5,
    });
  });

  it('is silent at 4 of 4, when answers are closed, or when attendance is disabled', () => {
    expect(
      keys(input({ attendance: { ...OPEN_ATTENDANCE, confirmedCount: 4 } })),
    ).not.toContain('attendance');
    expect(
      keys(input({ attendance: { ...OPEN_ATTENDANCE, answersOpen: false } })),
    ).not.toContain('attendance');
    expect(keys(input({ attendance: { ...OPEN_ATTENDANCE, enabled: false } }))).not.toContain(
      'attendance',
    );
    expect(keys(input({ attendance: null }))).not.toContain('attendance');
  });
});

describe('buildOrganizerNextActions — cost and results state', () => {
  it('shows only cost once results exist', () => {
    for (const resultsStatus of ['IN_PROGRESS', 'FINAL'] as const) {
      const hints = buildOrganizerNextActions(input({ game: { ...input().game, resultsStatus } }));
      expect(hints).toEqual([{ key: 'cost', unpaid: 2, action: 'review' }]);
    }
  });

  it('renders nothing after FINAL when everyone paid', () => {
    const i = input({
      game: { ...input().game, resultsStatus: 'FINAL' },
      cost: { unpaidCount: 0, viewerOwesUnpaid: false },
    });
    expect(buildOrganizerNextActions(i)).toEqual([]);
  });

  it('offers Settle when the viewer owes their own share', () => {
    const i = input({
      game: { ...input().game, resultsStatus: 'FINAL' },
      cost: { unpaidCount: 1, viewerOwesUnpaid: true },
    });
    expect(buildOrganizerNextActions(i)).toEqual([{ key: 'cost', unpaid: 1, action: 'settle' }]);
  });

  it('has no cost hint without a ledger', () => {
    expect(keys(input({ cost: null }))).not.toContain('cost');
  });
});

describe('buildOrganizerNextActions — audience and entity gates', () => {
  it('gives a game admin the same block as the owner', () => {
    // Both are `viewerRole: 'organizer'` — the shell maps owner/admin/`isAdmin` to it.
    expect(keys(input({ viewerRole: 'organizer' }))).toHaveLength(4);
  });

  it('gives a participant with invite rights only the seats line with Invite', () => {
    const hints = buildOrganizerNextActions(
      input({ viewerRole: 'inviter', game: { ...input().game, joinQueues: [{}] } }),
    );
    expect(hints).toEqual([{ key: 'seats', needed: 1, waiting: 1, action: 'invite' }]);
  });

  it('gives an inviter nothing once the roster is full or results exist', () => {
    expect(
      buildOrganizerNextActions(
        input({ viewerRole: 'inviter', game: { ...input().game, participants: playing(4) } }),
      ),
    ).toEqual([]);
    expect(
      buildOrganizerNextActions(
        input({ viewerRole: 'inviter', game: { ...input().game, resultsStatus: 'FINAL' } }),
      ),
    ).toEqual([]);
  });

  it.each(['participant', 'none'] as OrganizerViewerRole[])('gives a %s nothing', (viewerRole) => {
    expect(buildOrganizerNextActions(input({ viewerRole }))).toEqual([]);
  });

  it.each(['LEAGUE', 'LEAGUE_SEASON', 'EVENT'])('renders nothing for %s', (entityType) => {
    expect(buildOrganizerNextActions(input({ game: { ...input().game, entityType } }))).toEqual([]);
  });

  it('renders nothing for an archived game', () => {
    expect(buildOrganizerNextActions(input({ game: { ...input().game, status: 'ARCHIVED' } }))).toEqual([]);
  });

  it.each(['TOURNAMENT', 'TRAINING'])('supports %s like a game', (entityType) => {
    expect(keys(input({ game: { ...input().game, entityType } }))).toEqual([
      'seats',
      'booking',
      'attendance',
      'cost',
    ]);
  });
});
