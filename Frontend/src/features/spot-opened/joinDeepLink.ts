/**
 * PRD 347 — the `?join=1` deep link contract, separated from the component so the
 * pure helpers can be imported and unit-tested without React.
 */

export const JOIN_DEEP_LINK_PARAM = 'join';

/** Strips `?join=1` from a search string, preserving every other param. */
export function stripJoinParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(JOIN_DEEP_LINK_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export function shouldRunJoinDeepLink(search: string): boolean {
  return new URLSearchParams(search).get(JOIN_DEEP_LINK_PARAM) === '1';
}

export interface JoinDeepLinkViewer {
  /** Any participant row that is not a queue slot: seat, invite, guest. */
  isParticipantNonGuest: boolean;
  isGuest: boolean;
  hasPendingInvite: boolean;
  isInJoinQueue: boolean;
  /** `Game.allowDirectJoin` — false when the organizer accepts by hand. */
  allowDirectJoin: boolean;
}

/**
 * Whether `?join=1` should be swallowed instead of running the join flow.
 *
 * A **queued** player is the primary target of the "spot opened" push, so for
 * them the link must actually run the join — that is the whole point of the
 * "Join now" action. The one exception is a game the organizer fills by hand:
 * self-promotion is refused server-side, so firing the request would only earn
 * a pointless error toast. There the link just opens the page, where the queue
 * panel already explains that the organizer accepts manually.
 */
export function shouldSwallowJoinDeepLink(viewer: JoinDeepLinkViewer): boolean {
  if (viewer.isInJoinQueue) return !viewer.allowDirectJoin;
  return viewer.isParticipantNonGuest || viewer.hasPendingInvite || viewer.isGuest;
}
