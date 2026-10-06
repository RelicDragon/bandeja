/**
 * What the "When and where" editor needs from the game page's court section
 * for a game at a club: its court slots and linked bookings, the reschedule
 * planner's inputs, and the runner that does the club changes when a game
 * with bookings moves (owned by `GameCourtsSection`, so the card's
 * "unfinished changes" notice and the editor share one run).
 */
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type { OccupancyBlock, SharedGameRef } from '@shared/gameBooking/planReschedule';
import type { ProviderCapabilityOverrides } from '@shared/gameBooking/providerCapabilities';
import type { CourtRef } from '@/features/court-reservations/courtReservationsModel';
import type { LinkedBookingPayload } from '@/features/court-reservations/courtReservationsInput';
import type { EffectiveReschedulePlan } from '@/features/court-reservations/rescheduleChoices';
import type { RunJournal } from '@/features/court-reservations/reservationRunner';

export type SchedulePlanner = {
  slots: readonly CourtSlotView[];
  courtsById: Readonly<Record<string, CourtRef>>;
  /** Club courts in preference order (alternatives for "switch court"). */
  clubCourts: readonly CourtRef[];
  occupancy: readonly OccupancyBlock[];
  sharedWith?: Readonly<Record<string, readonly SharedGameRef[] | undefined>>;
  providerCapabilities?: ProviderCapabilityOverrides;
  /** Players who get the one time-change notice. */
  playerCount: number;
  /** Linked bookings and whether this organizer may cancel each at the club. */
  links: readonly { link: LinkedBookingPayload; canCancel: boolean }[];
  /** The current run (club changes of a time move), or null. */
  run: RunJournal | null;
  busy: boolean;
  start: (plan: EffectiveReschedulePlan, from: IsoInterval, to: IsoInterval) => void;
  retry: () => void;
  dismissRun: () => void;
  /** Another change of ours is already running: adopt and finish it. */
  resumeOther?: () => void;
  /** Before the club or the time is removed: each booking is cancelled at the club or just removed from the game. */
  releaseLinks: (choices: readonly { link: LinkedBookingPayload; cancel: boolean }[]) => Promise<void>;
};
