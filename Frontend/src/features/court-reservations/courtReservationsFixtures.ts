/**
 * Realistic fixture data for `CourtReservationsPreview` and component tests:
 * X-Padel Niš (Europe/Belgrade), a Thursday evening mix on 2026-10-08,
 * 18:00–19:30 club time (16:00–17:30 UTC, CEST).
 */
import {
  deriveCourtReservations,
  type DeriveCourtReservationsInput,
} from '@shared/gameBooking/courtReservations';
import type { OccupancyBlock, SharedGameRef } from '@shared/gameBooking/planReschedule';
import type { ClubFollowUp } from './clubFollowUps';
import type { CourtRef } from './courtReservationsModel';
import type { ReservationDrift } from './reservationDrift';

export const FIXTURE_TIME_ZONE = 'Europe/Belgrade';
export const FIXTURE_CLUB_NAME = 'X-Padel';
export const FIXTURE_GAME_ID = 'preview-game';

/** `HH:mm` club time on the fixture day → UTC ISO (CEST = UTC+2). */
export function at(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 8, h - 2, m)).toISOString();
}

export const FIXTURE_COURTS: CourtRef[] = [
  { id: 'c1', name: 'Court 1', externalCourtId: 'bt-1', isIndoor: true },
  { id: 'c2', name: 'Court 2', externalCourtId: 'bt-2', isIndoor: true },
  { id: 'c3', name: 'Court 3', externalCourtId: 'bt-3', isIndoor: true },
  { id: 'c4', name: 'Court 4', externalCourtId: 'bt-4', isIndoor: false },
  { id: 'c5', name: 'Court 5', externalCourtId: 'bt-5', isIndoor: false },
];

export const FIXTURE_COURTS_BY_ID: Record<string, CourtRef> = Object.fromEntries(FIXTURE_COURTS.map((c) => [c.id, c]));

export const FIXTURE_WINDOW = { start: at('18:00'), end: at('19:30') };

export type FixtureScenario = 'mixed' | 'planned' | 'reserved' | 'gap';

const GAME = { startTime: FIXTURE_WINDOW.start, endTime: FIXTURE_WINDOW.end, playersPerMatch: 4, timeIsSet: true };

export function fixtureInput(scenario: FixtureScenario): DeriveCourtReservationsInput {
  switch (scenario) {
    case 'planned':
      return {
        game: { ...GAME, maxParticipants: 16 },
        gameCourts: [
          { gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'NONE' },
          { gameCourtId: 'gc2', courtId: 'c2', order: 2, reservation: 'NONE' },
        ],
        reportedAnyCourtCount: 0,
        links: [],
      };
    case 'reserved':
      return {
        game: { ...GAME, maxParticipants: 8 },
        gameCourts: [
          { gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'NONE' },
          { gameCourtId: 'gc2', courtId: 'c2', order: 2, reservation: 'REPORTED', reportedById: 'u1', reportedAt: at('09:00') },
        ],
        reportedAnyCourtCount: 0,
        links: [
          { id: 'l1', externalBookingId: 'bt-9001', provider: 'BOOKTIME', courtId: 'c1', gameCourtId: 'gc1', bookingStart: at('18:00'), bookingEnd: at('20:00') },
        ],
      };
    case 'gap':
      return {
        game: { ...GAME, maxParticipants: 8 },
        gameCourts: [
          { gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'NONE' },
          { gameCourtId: 'gc3', courtId: 'c3', order: 2, reservation: 'NONE' },
        ],
        reportedAnyCourtCount: 0,
        links: [
          { id: 'l1', externalBookingId: 'bt-9001', provider: 'BOOKTIME', courtId: 'c1', gameCourtId: 'gc1', bookingStart: at('18:00'), bookingEnd: at('20:00') },
          { id: 'l3', externalBookingId: 'bt-9003', provider: 'BOOKTIME', courtId: 'c3', gameCourtId: 'gc3', bookingStart: at('18:00'), bookingEnd: at('19:00') },
        ],
      };
    case 'mixed':
    default:
      return {
        game: { ...GAME, maxParticipants: 16 },
        // 4 courts for 16 players; 3 are assigned, one is "any court".
        courtSlotCount: 4,
        gameCourts: [
          { gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'NONE' },
          { gameCourtId: 'gc2', courtId: 'c2', order: 2, reservation: 'NONE' },
          { gameCourtId: 'gc3', courtId: 'c3', order: 3, reservation: 'REPORTED', reportedById: 'u1', reportedAt: at('09:00') },
        ],
        reportedAnyCourtCount: 0,
        links: [
          { id: 'l1', externalBookingId: 'bt-9001', provider: 'BOOKTIME', courtId: 'c1', gameCourtId: 'gc1', bookingStart: at('18:00'), bookingEnd: at('19:30') },
          { id: 'l2', externalBookingId: 'bt-9002', provider: 'BOOKTIME', courtId: 'c2', gameCourtId: 'gc2', bookingStart: at('17:00'), bookingEnd: at('19:00') },
        ],
      };
  }
}

export function fixtureReservations(scenario: FixtureScenario) {
  return deriveCourtReservations(fixtureInput(scenario));
}

/** Court 2's 17:00–19:00 reservation is also used by an earlier drill session. */
export const FIXTURE_SHARED_WITH: Record<string, SharedGameRef[]> = {
  l2: [{ gameId: 'g-warmup', name: 'Warm-up drills', start: at('17:00'), end: at('18:00'), canEdit: true }],
};

export const FIXTURE_OCCUPANCY: OccupancyBlock[] = [
  { courtId: 'c1', start: at('19:30'), end: at('21:00'), kind: 'club', label: 'Club booking' },
  { courtId: 'c3', start: at('19:30'), end: at('20:30'), kind: 'hold', label: 'Club hold' },
  { courtId: 'c4', start: at('20:00'), end: at('21:30'), kind: 'app_game_planned', gameId: 'g-ladies', label: 'Ladies ladder' },
  { courtId: 'c2', start: at('16:00'), end: at('17:00'), kind: 'app_game_reserved', gameId: 'g-kids', label: 'Kids academy' },
];

export const FIXTURE_FOLLOW_UPS: ClubFollowUp[] = [
  { id: 'fu1', reason: 'cancel_old', provider: 'BOOKTIME', courtId: 'c2', externalBookingId: 'bt-8001', start: at('18:00'), end: at('19:30') },
];

export const FIXTURE_DRIFTS: ReservationDrift[] = [
  {
    linkId: 'l2',
    externalBookingId: 'bt-9002',
    provider: 'BOOKTIME',
    courtId: 'c2',
    state: 'MOVED',
    upstreamStart: at('19:00'),
    upstreamEnd: at('20:30'),
  },
];
