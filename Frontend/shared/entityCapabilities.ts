export type EntityTypeId =
  | 'GAME'
  | 'TOURNAMENT'
  | 'LEAGUE'
  | 'LEAGUE_SEASON'
  | 'BAR'
  | 'TRAINING'
  | 'EVENT';

export type EntityCapabilities = {
  hasResults: boolean;
  hasRating: boolean;
  hasBooking: boolean;
  hasLevelGate: boolean;
  hasLevelBand: boolean;
  hasOccupancy: boolean;
  hasPlayIntentRadar: boolean;
  hasPartnerBoard: boolean;
  /**
   * PRD 360 — the organizer can promise "Novices welcome" on this entity type.
   * True where the organizer actually shapes the roster (GAME, TOURNAMENT,
   * TRAINING, BAR); false for league fixtures, season shells and EVENT
   * listings, where they do not.
   */
  hasNoviceTag: boolean;
  archiveByTime: boolean;
  unboundedRoster: boolean;
  alwaysPublic: boolean;
  alwaysDirectJoin: boolean;
  excludeFromCompetitiveStats: boolean;
  skipPlayIntentNotify: boolean;
};

const GAME_CAPS: EntityCapabilities = {
  hasResults: true,
  hasRating: true,
  hasBooking: true,
  hasLevelGate: true,
  hasLevelBand: true,
  hasOccupancy: true,
  hasPlayIntentRadar: true,
  hasPartnerBoard: false,
  hasNoviceTag: true,
  archiveByTime: false,
  unboundedRoster: false,
  alwaysPublic: false,
  alwaysDirectJoin: false,
  excludeFromCompetitiveStats: false,
  skipPlayIntentNotify: false,
};

const TOURNAMENT_CAPS: EntityCapabilities = {
  ...GAME_CAPS,
  hasPlayIntentRadar: true,
  skipPlayIntentNotify: true,
};

const LEAGUE_CAPS: EntityCapabilities = {
  ...GAME_CAPS,
  hasPlayIntentRadar: false,
  // A fixture's roster comes from the league, not from an organizer's invitation.
  hasNoviceTag: false,
  skipPlayIntentNotify: true,
};

const LEAGUE_SEASON_CAPS: EntityCapabilities = {
  hasResults: true,
  hasRating: false,
  hasBooking: false,
  hasLevelGate: false,
  hasLevelBand: false,
  hasOccupancy: true,
  hasPlayIntentRadar: false,
  hasPartnerBoard: false,
  hasNoviceTag: false,
  archiveByTime: true,
  unboundedRoster: false,
  alwaysPublic: false,
  alwaysDirectJoin: false,
  excludeFromCompetitiveStats: true,
  skipPlayIntentNotify: true,
};

const BAR_CAPS: EntityCapabilities = {
  hasResults: false,
  hasRating: false,
  hasBooking: false,
  hasLevelGate: false,
  hasLevelBand: false,
  hasOccupancy: false,
  hasPlayIntentRadar: true,
  hasPartnerBoard: false,
  hasNoviceTag: true,
  archiveByTime: true,
  unboundedRoster: true,
  alwaysPublic: false,
  alwaysDirectJoin: false,
  excludeFromCompetitiveStats: true,
  skipPlayIntentNotify: false,
};

const TRAINING_CAPS: EntityCapabilities = {
  hasResults: true,
  hasRating: false,
  hasBooking: true,
  hasLevelGate: false,
  hasLevelBand: true,
  hasOccupancy: true,
  hasPlayIntentRadar: false,
  hasPartnerBoard: false,
  hasNoviceTag: true,
  archiveByTime: false,
  unboundedRoster: false,
  alwaysPublic: false,
  alwaysDirectJoin: false,
  excludeFromCompetitiveStats: false,
  skipPlayIntentNotify: true,
};

const EVENT_CAPS: EntityCapabilities = {
  hasResults: false,
  hasRating: false,
  hasBooking: false,
  hasLevelGate: false,
  hasLevelBand: true,
  hasOccupancy: false,
  hasPlayIntentRadar: false,
  hasPartnerBoard: true,
  hasNoviceTag: false,
  archiveByTime: true,
  unboundedRoster: true,
  alwaysPublic: true,
  alwaysDirectJoin: true,
  excludeFromCompetitiveStats: true,
  skipPlayIntentNotify: true,
};

const CAPS: Record<EntityTypeId, EntityCapabilities> = {
  GAME: GAME_CAPS,
  TOURNAMENT: TOURNAMENT_CAPS,
  LEAGUE: LEAGUE_CAPS,
  LEAGUE_SEASON: LEAGUE_SEASON_CAPS,
  BAR: BAR_CAPS,
  TRAINING: TRAINING_CAPS,
  EVENT: EVENT_CAPS,
};

export const EVENT_UNBOUNDED_ROSTER = 999;
export const EVENT_MAX_HEROES = 8;
export const EVENT_KINDS = ['TOURNAMENT', 'LEAGUE', 'CAMP'] as const;
export type EventKindId = (typeof EVENT_KINDS)[number];

export function isEntityTypeId(value: string): value is EntityTypeId {
  return value in CAPS;
}

export function getEntityCapabilities(entityType: string): EntityCapabilities {
  if (isEntityTypeId(entityType)) return CAPS[entityType];
  return GAME_CAPS;
}

export function isEventEntity(entityType: string): boolean {
  return entityType === 'EVENT';
}
