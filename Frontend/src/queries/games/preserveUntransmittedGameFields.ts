/**
 * A socket `game-updated` payload is a *partial* view of the game.
 *
 * The backend broadcasts one payload to a room whose members hold mixed
 * entitlements (roster members, invited users, watchers of a public game, and
 * every player of a league **season** for any of its fixtures), so it projects
 * that payload for the least-entitled recipient: `Game.paymentMethods` and its
 * legacy `Game.paymentHint` mirror — an IBAN, a Bizum or IPS Prenesi phone
 * number — are stripped, and so are the two fields the HTTP read
 * computes for the asking viewer rather than for the game
 * (`Backend/src/services/game/gameDetail.projection.ts`,
 * `projectGameForBroadcast`).
 *
 * So a missing key in a socket payload means **"not transmitted"**, never
 * "cleared". A screen that replaces its game object wholesale from a broadcast
 * must carry these fields over from the copy it fetched over HTTP, where the
 * entitlement was evaluated for *this* viewer — otherwise the organizer's own
 * screen forgets her saved IBAN the moment another player leaves the game, and
 * the next edit writes the blank back.
 */
import type { Game } from '@/types';

/** Keys a `game-updated` payload never carries. Mirrors `GAME_BROADCAST_STRIPPED_KEYS`. */
export const GAME_SOCKET_UNTRANSMITTED_KEYS = [
  'paymentHint',
  'paymentMethods',
  'userNote',
  'isClubFavorite',
] as const;

export type GameSocketUntransmittedKey = (typeof GAME_SOCKET_UNTRANSMITTED_KEYS)[number];

/**
 * Carry the untransmitted fields from the previously held game onto a game that
 * arrived over the socket.
 *
 * A key the payload *does* carry always wins — this only fills absences.
 */
export function preserveUntransmittedGameFields(
  previous: Game | null | undefined,
  incoming: Game,
): Game {
  if (!previous) return incoming;

  const merged: Game = { ...incoming };
  let changed = false;

  if (!('paymentHint' in incoming) && previous.paymentHint !== undefined) {
    merged.paymentHint = previous.paymentHint;
    changed = true;
  }
  if (!('paymentMethods' in incoming) && previous.paymentMethods !== undefined) {
    merged.paymentMethods = previous.paymentMethods;
    changed = true;
  }
  if (!('userNote' in incoming) && previous.userNote !== undefined) {
    merged.userNote = previous.userNote;
    changed = true;
  }
  if (!('isClubFavorite' in incoming) && previous.isClubFavorite !== undefined) {
    merged.isClubFavorite = previous.isClubFavorite;
    changed = true;
  }

  return changed ? merged : incoming;
}
