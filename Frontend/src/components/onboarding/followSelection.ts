/**
 * PRD 350 step 5 — the Follow pill's state machine, isolated from the view.
 *
 * The pill is optimistic: it flips to "Following" the moment it is tapped and
 * rolls back only if the request fails. `pending` exists so a double tap, or
 * "Follow all" landing on a row that is already in flight, cannot fire two
 * requests for the same player.
 */
export interface FollowState {
  followed: ReadonlySet<string>;
  pending: ReadonlySet<string>;
}

export const EMPTY_FOLLOW_STATE: FollowState = { followed: new Set(), pending: new Set() };

export function isFollowing(state: FollowState, userId: string): boolean {
  return state.followed.has(userId);
}

export function canFollow(state: FollowState, userId: string): boolean {
  return !state.followed.has(userId) && !state.pending.has(userId);
}

function withAdded(set: ReadonlySet<string>, userId: string): Set<string> {
  const next = new Set(set);
  next.add(userId);
  return next;
}

function withRemoved(set: ReadonlySet<string>, userId: string): Set<string> {
  const next = new Set(set);
  next.delete(userId);
  return next;
}

/** Optimistic flip. */
export function markFollowing(state: FollowState, userId: string): FollowState {
  return {
    followed: withAdded(state.followed, userId),
    pending: withAdded(state.pending, userId),
  };
}

/** The request succeeded: keep the pill, drop the in-flight marker. */
export function settleFollow(state: FollowState, userId: string): FollowState {
  return { followed: state.followed, pending: withRemoved(state.pending, userId) };
}

/** The request failed: put the pill back so the user can retry. */
export function rollbackFollow(state: FollowState, userId: string): FollowState {
  return {
    followed: withRemoved(state.followed, userId),
    pending: withRemoved(state.pending, userId),
  };
}

/** Hides "Follow all" once there is nothing left to follow. */
export function areAllFollowed(userIds: readonly string[], state: FollowState): boolean {
  return userIds.length > 0 && userIds.every((userId) => state.followed.has(userId));
}
