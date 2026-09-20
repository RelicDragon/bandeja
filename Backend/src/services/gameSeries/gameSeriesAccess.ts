/**
 * PRD 345 — who may do what on a game series.
 *
 * Every rule here is a **pure** predicate so it can be unit-tested without a
 * database and so the service, the controller and the push-action handler all
 * share one definition instead of three hand-rolled `if`s.
 *
 * Two rules are load-bearing and must not be "simplified":
 *
 * 1. **The regular roster is owner-managed.** There is no self-service path
 *    onto someone else's roster — an `actorId === targetUserId` shortcut here
 *    is an authorization bypass, because being a regular is what unlocks the
 *    carry-over seat and the private series chat. Self-*removal* is the one
 *    sanctioned self-referential action (PRD 345, user story 18).
 * 2. **A seat claim only ever applies to the series' *next* occurrence**, and
 *    only for someone who is genuinely on the roster right now. The gameId in
 *    a push token is attacker-supplied data, so it is compared against the id
 *    the server recomputes, never trusted on its own.
 *
 * Everything fails closed: an unknown or empty actor is refused.
 */

/** Non-empty string check — an unresolved actor id must never pass a gate. */
function isResolvedId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export interface SeriesManagerInput {
  seriesOwnerId: string;
  actorId: string | null | undefined;
  isAdmin?: boolean;
}

/**
 * May this actor manage the series (template, skips, roster, chat)?
 * Owner or platform admin — nobody else, including the actor themselves.
 */
export function isSeriesManager({
  seriesOwnerId,
  actorId,
  isAdmin = false,
}: SeriesManagerInput): boolean {
  if (!isResolvedId(actorId)) return false;
  if (isAdmin) return true;
  return isResolvedId(seriesOwnerId) && actorId === seriesOwnerId;
}

export interface SeriesSelfRemovalInput extends SeriesManagerInput {
  targetUserId: string;
}

/**
 * Removing a regular: the owner/admin may remove anyone, and a regular may
 * remove themselves ("not next week" without leaving tonight's game).
 */
export function canRemoveSeriesRegular({
  seriesOwnerId,
  actorId,
  isAdmin = false,
  targetUserId,
}: SeriesSelfRemovalInput): boolean {
  if (!isResolvedId(actorId)) return false;
  if (isSeriesManager({ seriesOwnerId, actorId, isAdmin })) return true;
  return isResolvedId(targetUserId) && actorId === targetUserId;
}

export interface SeriesInsiderInput {
  viewerId: string | null | undefined;
  seriesOwnerId: string;
  isAdmin?: boolean;
  /** `GameSeriesRegular` row with `removedAt === null`. */
  viewerIsActiveRegular: boolean;
  /** Holds a `GameParticipant` row on an occurrence of this series. */
  viewerIsOccurrenceParticipant: boolean;
}

/**
 * May this viewer see series-private data — the regular roster with names and
 * avatars, the next occurrence's id, the confirmation counters, the occurrence
 * history? The public `↻ Weekly` card label is deliberately *not* gated on
 * this (PRD 345, user story 10): a newcomer sees the pill, not the roster.
 */
export function isSeriesInsider({
  viewerId,
  seriesOwnerId,
  isAdmin = false,
  viewerIsActiveRegular,
  viewerIsOccurrenceParticipant,
}: SeriesInsiderInput): boolean {
  if (!isResolvedId(viewerId)) return false;
  if (isSeriesManager({ seriesOwnerId, actorId: viewerId, isAdmin })) return true;
  return viewerIsActiveRegular || viewerIsOccurrenceParticipant;
}

export type SeriesSeatClaimRefusal =
  | 'errors.series.occurrenceClosed'
  | 'errors.series.notNextOccurrence'
  | 'errors.series.notARegular';

export interface SeriesSeatClaimInput {
  actorId: string | null | undefined;
  seriesOwnerId: string;
  /** `GameSeries.status`. */
  seriesStatus: string;
  /** `GameSeriesRegular` row with `removedAt === null`. */
  actorIsActiveRegular: boolean;
  /** The gameId the caller (or their push token) asked to be seated on. */
  requestedGameId: string;
  /**
   * The id the *server* resolved as the series' next joinable occurrence.
   * `null` when there is none — then there is nothing to claim.
   */
  nextOccurrenceId: string | null;
}

export type SeriesSeatClaimDecision =
  | { allowed: true }
  | { allowed: false; refusal: SeriesSeatClaimRefusal };

/**
 * Is this user entitled to *attempt* the carry-over seat on this game?
 *
 * Entitlement only — the caller still runs the ordinary join validation
 * (`validatePlayerCanJoinGame`: roster lock, level band, gender, capacity).
 * Being a regular buys you a shortcut past the *invite*, never past the rules
 * of the game itself.
 */
export function evaluateSeriesSeatClaim(input: SeriesSeatClaimInput): SeriesSeatClaimDecision {
  if (!isResolvedId(input.actorId)) {
    return { allowed: false, refusal: 'errors.series.notARegular' };
  }
  if (input.seriesStatus !== 'ACTIVE') {
    return { allowed: false, refusal: 'errors.series.occurrenceClosed' };
  }
  if (!isResolvedId(input.nextOccurrenceId)) {
    return { allowed: false, refusal: 'errors.series.occurrenceClosed' };
  }
  if (input.requestedGameId !== input.nextOccurrenceId) {
    return { allowed: false, refusal: 'errors.series.notNextOccurrence' };
  }
  const isOwner = isResolvedId(input.seriesOwnerId) && input.actorId === input.seriesOwnerId;
  if (!input.actorIsActiveRegular && !isOwner) {
    return { allowed: false, refusal: 'errors.series.notARegular' };
  }
  return { allowed: true };
}
