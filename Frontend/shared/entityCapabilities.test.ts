import { describe, expect, it } from 'vitest';
import {
  EVENT_UNBOUNDED_ROSTER,
  getEntityCapabilities,
  isEventEntity,
} from './entityCapabilities';

describe('entityCapabilities', () => {
  it('EVENT is a listing with partner board and no rating/results/radar', () => {
    const event = getEntityCapabilities('EVENT');
    expect(event.hasResults).toBe(false);
    expect(event.hasRating).toBe(false);
    expect(event.hasBooking).toBe(false);
    expect(event.hasLevelGate).toBe(false);
    expect(event.hasLevelBand).toBe(true);
    expect(event.hasOccupancy).toBe(false);
    expect(event.hasPlayIntentRadar).toBe(false);
    expect(event.hasPartnerBoard).toBe(true);
    expect(event.archiveByTime).toBe(true);
    expect(event.unboundedRoster).toBe(true);
    expect(event.alwaysPublic).toBe(true);
    expect(event.alwaysDirectJoin).toBe(true);
    expect(event.excludeFromCompetitiveStats).toBe(true);
    expect(event.skipPlayIntentNotify).toBe(true);
    expect(EVENT_UNBOUNDED_ROSTER).toBe(999);
    expect(isEventEntity('EVENT')).toBe(true);
  });

  it('keeps BAR radar and GAME results occupancy', () => {
    const bar = getEntityCapabilities('BAR');
    expect(bar.hasLevelBand).toBe(false);
    expect(bar.hasPlayIntentRadar).toBe(true);
    expect(bar.archiveByTime).toBe(true);
    expect(bar.excludeFromCompetitiveStats).toBe(true);
    expect(bar.hasPartnerBoard).toBe(false);

    const game = getEntityCapabilities('GAME');
    expect(game.hasResults).toBe(true);
    expect(game.hasOccupancy).toBe(true);
    expect(game.archiveByTime).toBe(false);

    const training = getEntityCapabilities('TRAINING');
    expect(training.hasPlayIntentRadar).toBe(false);
    expect(training.skipPlayIntentNotify).toBe(true);
  });

  // PRD 360 — the "Novices welcome" promise only exists where an organizer
  // decides who joins. A league fixture's roster comes from the league, and an
  // EVENT listing has no roster to welcome anyone into.
  it('offers the novice tag exactly to GAME, TOURNAMENT, TRAINING and BAR', () => {
    for (const entityType of ['GAME', 'TOURNAMENT', 'TRAINING', 'BAR'] as const) {
      expect(getEntityCapabilities(entityType).hasNoviceTag).toBe(true);
    }
    for (const entityType of ['LEAGUE', 'LEAGUE_SEASON', 'EVENT'] as const) {
      expect(getEntityCapabilities(entityType).hasNoviceTag).toBe(false);
    }
  });

  // PRD 362 — "Play with this group again" copies a format and invites the old
  // roster. That only makes sense where one participant sets up the next
  // session; a league schedules its own fixtures and an EVENT is a listing.
  it('offers a rematch exactly to GAME, TOURNAMENT, TRAINING and BAR', () => {
    for (const entityType of ['GAME', 'TOURNAMENT', 'TRAINING', 'BAR'] as const) {
      expect(getEntityCapabilities(entityType).canRematch).toBe(true);
    }
    for (const entityType of ['LEAGUE', 'LEAGUE_SEASON', 'EVENT'] as const) {
      expect(getEntityCapabilities(entityType).canRematch).toBe(false);
    }
  });
});
