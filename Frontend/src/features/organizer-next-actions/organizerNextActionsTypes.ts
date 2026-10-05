/**
 * PRD 364 — the organizer "Next steps" block, as data.
 *
 * Every hint is a fact with exactly one action. There is no "all done" hint on
 * purpose: an empty list means the block does not render at all.
 */

export type OrganizerHintKey = 'seats' | 'booking' | 'attendance' | 'cost';

export type SeatsHint = {
  key: 'seats';
  /** Seats not taken by a PLAYING participant. Always ≥ 1 when the hint exists. */
  needed: number;
  /** `maxParticipants` — the ring around the row icon shows `capacity - needed` of it. */
  capacity: number;
  /** People in the join queue. */
  waiting: number;
  action: 'reviewQueue' | 'invite';
};

export type BookingHint = {
  key: 'booking';
  /**
   * Court reservation summary (`utils/courtReservationView`):
   * `none` — no court reserved; `partial` — `reserved` of `total` courts;
   * `gap` — every court reserved but a linked booking leaves a gap at `gapTime`.
   */
  state: 'none' | 'partial' | 'gap';
  reserved: number;
  total: number;
  /** Earliest gap start, already formatted in the club's timezone; only for `gap`. */
  gapTime: string | null;
  /** `seeBookings` scrolls to the linked-bookings section; `editCourt` opens the existing court/time editor. */
  action: 'seeBookings' | 'editCourt';
};

export type AttendanceHint = {
  key: 'attendance';
  confirmed: number;
  total: number;
  nudgeAllowed: boolean;
  /** Whole hours until the next nudge is allowed; meaningful only when `nudgeAllowed` is false. */
  nudgeRemainingHours: number;
};

export type CostHint = {
  key: 'cost';
  /** Non-payer shares still in `UNPAID`. */
  unpaid: number;
  /** `settle` — the viewer owes and can mark their own share; `review` — scroll to the ledger. */
  action: 'settle' | 'review';
};

export type OrganizerHint = SeatsHint | BookingHint | AttendanceHint | CostHint;

/**
 * Who is looking. `organizer` = owner or admin (`canEdit` in the shell);
 * `inviter` = a participant with invite rights who cannot edit; everyone else
 * sees no block.
 */
export type OrganizerViewerRole = 'organizer' | 'inviter' | 'participant' | 'none';

/** Attendance facts the shell already has from `useGameAttendance`. */
export interface OrganizerAttendanceInput {
  /** `false` when the game cannot have attendance at all (no time, EVENT, …). */
  enabled: boolean;
  answersOpen: boolean;
  confirmedCount: number;
  playingCount: number;
  nudgeAllowed: boolean;
  nudgeRemainingHours: number;
}

/**
 * Court reservation facts — the summary from `utils/courtReservationView`,
 * derived from the game payload, never from a provider call.
 */
export interface OrganizerReservationInput {
  kind: 'planned' | 'partial' | 'reserved' | 'reserved_with_gap';
  reserved: number;
  total: number;
  /** Earliest gap start, formatted in the club's timezone; `null` unless `reserved_with_gap`. */
  gapTime: string | null;
}

/** Cost facts from the PRD 348 ledger the Cost card already loads. */
export interface OrganizerCostInput {
  /** Non-payer shares in `UNPAID`. */
  unpaidCount: number;
  /** The viewer's own share is unpaid, so they can settle it themselves. */
  viewerOwesUnpaid: boolean;
}

export interface OrganizerNextActionsGame {
  entityType: string;
  status: string;
  resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
  timeIsSet?: boolean;
  maxParticipants: number;
  participants: readonly { status: string }[];
  joinQueues?: readonly unknown[];
  /** The game belongs to a club, so "not reserved" is a real gap rather than a public court. */
  hasClub: boolean;
  linkedBookingCount: number;
}

export interface OrganizerNextActionsInput {
  game: OrganizerNextActionsGame;
  viewerRole: OrganizerViewerRole;
  /** The shell's `canInvitePlayers`: the viewer may open the invite picker right now. */
  canInvite: boolean;
  /** The shell's `canManageJoinQueue`: the viewer may accept or decline queued players. */
  canManageQueue: boolean;
  attendance: OrganizerAttendanceInput | null;
  reservation: OrganizerReservationInput | null;
  cost: OrganizerCostInput | null;
}
