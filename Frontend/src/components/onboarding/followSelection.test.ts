import { describe, expect, it } from 'vitest';
import {
  EMPTY_FOLLOW_STATE,
  areAllFollowed,
  canFollow,
  isFollowing,
  markFollowing,
  rollbackFollow,
  settleFollow,
} from './followSelection';

describe('follow pill', () => {
  it('flips optimistically on the first tap', () => {
    const state = markFollowing(EMPTY_FOLLOW_STATE, 'u1');
    expect(isFollowing(state, 'u1')).toBe(true);
    expect(canFollow(state, 'u1')).toBe(false);
  });

  it('keeps the pill after the request succeeds', () => {
    const state = settleFollow(markFollowing(EMPTY_FOLLOW_STATE, 'u1'), 'u1');
    expect(isFollowing(state, 'u1')).toBe(true);
    // Still not followable — the user already follows them.
    expect(canFollow(state, 'u1')).toBe(false);
  });

  it('rolls back and allows a retry after a failure', () => {
    const state = rollbackFollow(markFollowing(EMPTY_FOLLOW_STATE, 'u1'), 'u1');
    expect(isFollowing(state, 'u1')).toBe(false);
    expect(canFollow(state, 'u1')).toBe(true);
  });

  it('never fires twice for the same player', () => {
    let state = EMPTY_FOLLOW_STATE;
    const ids = ['u1', 'u1', 'u2'];
    const sent: string[] = [];
    for (const id of ids) {
      if (!canFollow(state, id)) continue;
      sent.push(id);
      state = markFollowing(state, id);
    }
    expect(sent).toEqual(['u1', 'u2']);
  });

  it('does not touch the other rows', () => {
    const state = markFollowing(EMPTY_FOLLOW_STATE, 'u1');
    expect(isFollowing(state, 'u2')).toBe(false);
    expect(canFollow(state, 'u2')).toBe(true);
  });

  it('reports "all followed" only when the list is non-empty and complete', () => {
    expect(areAllFollowed([], EMPTY_FOLLOW_STATE)).toBe(false);
    let state = markFollowing(EMPTY_FOLLOW_STATE, 'u1');
    expect(areAllFollowed(['u1', 'u2'], state)).toBe(false);
    state = markFollowing(state, 'u2');
    expect(areAllFollowed(['u1', 'u2'], state)).toBe(true);
  });

  it('is immutable — the previous state is untouched', () => {
    const before = markFollowing(EMPTY_FOLLOW_STATE, 'u1');
    const after = rollbackFollow(before, 'u1');
    expect(isFollowing(before, 'u1')).toBe(true);
    expect(isFollowing(after, 'u1')).toBe(false);
  });
});
