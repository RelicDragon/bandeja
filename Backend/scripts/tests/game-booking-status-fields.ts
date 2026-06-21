import assert from 'node:assert/strict';
import { gamePatchAffectsBookingStatus } from '../../src/services/game/gameExternalBooking.service';

assert.equal(gamePatchAffectsBookingStatus({ hasBookedCourt: true }), true);
assert.equal(gamePatchAffectsBookingStatus({ startTime: '2026-01-01T10:00:00.000Z' }), true);
assert.equal(gamePatchAffectsBookingStatus({ maxParticipants: 8 }), true);
assert.equal(gamePatchAffectsBookingStatus({ playersPerMatch: 2 }), true);
assert.equal(gamePatchAffectsBookingStatus({ timeOverride: false }), true);
assert.equal(gamePatchAffectsBookingStatus({ name: 'New name' }), false);
assert.equal(gamePatchAffectsBookingStatus({ description: 'x' }), false);

console.log('game-booking-status-fields: all passed');
