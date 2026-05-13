/**
 * Stable diagnostic codes for live-scoring PATCH rejects.
 *
 * Surface contract:
 *   - 400/409 responses MAY include `{ reasonCode: <code>, ... }` alongside the existing
 *     `message` field. Clients (and support tooling) can switch on the code without
 *     parsing free-form messages or i18n strings.
 *   - `matchLiveScoringAudit.reasonCode` stores the same code for diagnostics.
 *
 * Adding a new code is a contract change — keep entries sorted, document the trigger,
 * and avoid renaming existing codes once shipped.
 */
export const LIVE_SCORING_REASON_CODE = {
  /** PATCH body lacks `state` field. */
  MISSING_STATE: 'LIVE_MISSING_STATE',
  /** Non-finite or malformed `baseRevision` in body. */
  INVALID_BASE_REVISION: 'LIVE_INVALID_BASE_REVISION',
  /** `clientMessageId` / `opId` is not a non-empty `[A-Za-z0-9._-]{1,128}` string. */
  INVALID_IDEMPOTENCY_KEY: 'LIVE_INVALID_IDEMPOTENCY_KEY',
  /** Match does not belong to specified game. */
  MATCH_GAME_MISMATCH: 'LIVE_MATCH_GAME_MISMATCH',
  /** baseRevision did not match server's current envelope revision. 409. */
  REVISION_MISMATCH: 'LIVE_REVISION_MISMATCH',
  /** Normalized live sets failed `assertMatchNormalizedSetsValid` (role order / TB rules / classic). */
  INVALID_SETS: 'LIVE_INVALID_SETS',
  /** Live state graph could not reach `body.state` from server `current.state` within step limit. */
  TRANSITION_OUT_OF_GRAPH: 'LIVE_TRANSITION_OUT_OF_GRAPH',
  /** Match has walkover/default/retired — live scoring is closed. */
  NON_RALLY_OUTCOME: 'LIVE_NON_RALLY_OUTCOME',
} as const;

export type LiveScoringReasonCode =
  (typeof LIVE_SCORING_REASON_CODE)[keyof typeof LIVE_SCORING_REASON_CODE];
