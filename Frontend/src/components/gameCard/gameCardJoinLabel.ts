/**
 * PRD 359 — what the card's join CTA says.
 *
 * The default labels are the product's existing ones and stay the default: a
 * count is added only where it changes a decision. Three of four seats taken is
 * not news; the last one is.
 */

/** Above this many open seats the label is unchanged. */
export const SEATS_LEFT_THRESHOLD = 2;

export type GameCardJoinLabel =
  | { kind: 'join' }
  | { kind: 'joinSeatsLeft'; seats: number }
  | { kind: 'queue' }
  | { kind: 'queueWaiting'; waiting: number };

export interface GameCardJoinLabelInput {
  /** The card's existing "there is room" predicate (`!participation.isFull`). */
  hasFreeSlots: boolean;
  /** Seats open to this viewer, or `null` when the count is not provable. */
  openSeats: number | null;
  queueLength: number;
}

export function resolveGameCardJoinLabel({
  hasFreeSlots,
  openSeats,
  queueLength,
}: GameCardJoinLabelInput): GameCardJoinLabel {
  if (hasFreeSlots) {
    // Never "0 seats left": a zero here means the roster is full for this
    // viewer's gender while the game as a whole still has room, and the plain
    // label plus the existing gender gate already handle that.
    if (openSeats != null && openSeats > 0 && openSeats <= SEATS_LEFT_THRESHOLD) {
      return { kind: 'joinSeatsLeft', seats: openSeats };
    }
    return { kind: 'join' };
  }
  if (queueLength > 0) return { kind: 'queueWaiting', waiting: queueLength };
  return { kind: 'queue' };
}
