/**
 * PRD 347 — what tone the "Join now" outcome deserves.
 *
 * `POST /games/:id/join` answers **200** for several outcomes that are not a
 * seat: the caller was put in the queue, or — when they lose the race the
 * spot-opened push deliberately starts between everyone in the queue — the seat
 * was already gone. The shell used to route anything outside two hard-coded
 * keys to `toast.success`, so the loser of the race got a green checkmark
 * reading "Game is full" and reasonably concluded they were in.
 *
 * Pure so the mapping is testable without a toast library: the caller picks the
 * renderer.
 */
export type JoinOutcomeTone = 'success' | 'error';

/** Outcomes where the tap did what it said: a seat, or a place in the queue. */
const SUCCESS_KEYS = new Set([
  'games.joinedSuccessfully',
  'games.joinRequestAccepted',
  'games.addedToJoinQueue',
  'games.joinRequestSent',
]);

/**
 * Refusals the backend returns through the **200** path rather than throwing.
 * `errors.*` is matched by prefix; these carry no such marker.
 */
const REFUSAL_KEYS = new Set([
  'games.addedToQueueLevelOutOfRange',
  // Already queued and the seat went to somebody else — the spot-opened race.
  'games.alreadyInJoinQueue',
  'spots.queue.waitForOrganizer',
]);

export function joinOutcomeTone(message: string | null | undefined): JoinOutcomeTone {
  const key = (message ?? '').trim();
  if (!key) return 'success';
  if (SUCCESS_KEYS.has(key)) return 'success';
  if (REFUSAL_KEYS.has(key)) return 'error';
  // Every backend refusal key is namespaced `errors.*`; "Game is full" arrives
  // as `errors.invites.gameFull`.
  if (key.startsWith('errors.')) return 'error';
  return 'success';
}
