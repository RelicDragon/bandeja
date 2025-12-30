/**
 * Social Level Calculation Constants
 * 
 * These constants control how social levels are calculated and updated
 * for different game types and participant roles.
 */

/**
 * BAR Game Constants
 */
export const BAR_SOCIAL_LEVEL = {
  /**
   * Base social level increment per participant in a BAR game.
   * Each participant in a BAR game receives this amount multiplied by the number of participants.
   * Example: If there are 4 participants, each gets 0.05 * 4 = 0.2 social level boost.
   */
  INCREMENT_PER_PARTICIPANT: 0.05,
} as const;

/**
 * Social Participant Level Constants
 * 
 * These constants control social level boosts for regular games (non-BAR, non-LEAGUE_SEASON)
 * based on how many times participants have played together.
 */
export const SOCIAL_PARTICIPANT_LEVEL = {
  /**
   * Maximum boost per participant relationship when they've never played together before.
   * This is the starting boost value that decreases as participants play more games together.
   */
  MAX_BOOST_PER_RELATIONSHIP: 0.06,

  /**
   * Reduction amount per game played together.
   * For each previous game where two participants played together,
   * the boost is reduced by this amount (up to MAX_GAMES_FOR_REDUCTION).
   */
  REDUCTION_PER_GAME: 0.005,

  /**
   * Maximum number of games to consider for boost reduction.
   * After this many games together, the boost reaches its minimum value.
   * Formula: boost = MAX_BOOST_PER_RELATIONSHIP - (min(gamesPlayedTogether, MAX_GAMES_FOR_REDUCTION) * REDUCTION_PER_GAME)
   * Example: After 10 games together: 0.06 - (10 * 0.005) = 0.01 minimum boost
   */
  MAX_GAMES_FOR_REDUCTION: 10,
} as const;

/**
 * Role-Based Multipliers
 * 
 * These multipliers are applied to the base social level boost based on the participant's role
 * and whether they actually played in the game (isPlaying: true).
 * 
 * Priority order (highest to lowest):
 * 1. Current game OWNER
 * 2. Parent game OWNER
 * 3. Current game ADMIN
 * 4. Parent game ADMIN
 * 5. Regular PARTICIPANT
 */
export const ROLE_MULTIPLIERS = {
  /**
   * Multiplier for OWNER of the current game.
   * - If played: Gets 1.5x the base boost (reward for organizing and playing)
   * - If didn't play: Gets 0.5x the base boost (still rewarded for organizing, but less)
   */
  OWNER: {
    PLAYED: 1.5,
    NOT_PLAYED: 0.5,
  },

  /**
   * Multiplier for OWNER of the parent game (e.g., tournament owner for a round game).
   * - If played: Gets 1.2x the base boost
   * - If didn't play: Gets 0.2x the base boost (minimal reward for organizing parent game)
   */
  PARENT_OWNER: {
    PLAYED: 1.2,
    NOT_PLAYED: 0.2,
  },

  /**
   * Multiplier for ADMIN of the current game.
   * - If played: Gets 1.2x the base boost
   * - If didn't play: Gets 0.2x the base boost
   */
  ADMIN: {
    PLAYED: 1.2,
    NOT_PLAYED: 0.2,
  },

  /**
   * Multiplier for ADMIN of the parent game.
   * - If played: Gets 1.1x the base boost
   * - If didn't play: Gets 0.1x the base boost (minimal reward for organizing parent game)
   */
  PARENT_ADMIN: {
    PLAYED: 1.1,
    NOT_PLAYED: 0.1,
  },

  /**
   * Multiplier for regular PARTICIPANT (no special role).
   * - If played: Gets 1.0x the base boost (normal boost)
   * - If didn't play: Gets 0.0x (no boost if they didn't participate)
   */
  PARTICIPANT: {
    PLAYED: 1.0,
    NOT_PLAYED: 0.0,
  },
} as const;

