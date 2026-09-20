/**
 * PRD 347 — the `?join=1` deep link.
 *
 * The URL cleanup is the load-bearing part: a surviving `join=1` would re-fire
 * the join flow on every back-navigation and refresh.
 */
import { describe, expect, it } from 'vitest';
import {
  shouldRunJoinDeepLink,
  shouldSwallowJoinDeepLink,
  stripJoinParam,
  type JoinDeepLinkViewer,
} from './joinDeepLink';

describe('shouldRunJoinDeepLink', () => {
  it('only fires for the exact documented value', () => {
    expect(shouldRunJoinDeepLink('?join=1')).toBe(true);
    expect(shouldRunJoinDeepLink('?tab=chat&join=1')).toBe(true);
    expect(shouldRunJoinDeepLink('?join=0')).toBe(false);
    expect(shouldRunJoinDeepLink('?join=true')).toBe(false);
    expect(shouldRunJoinDeepLink('?joining=1')).toBe(false);
    expect(shouldRunJoinDeepLink('')).toBe(false);
  });
});

describe('stripJoinParam', () => {
  it('removes only the join param and keeps everything else', () => {
    expect(stripJoinParam('?join=1')).toBe('');
    expect(stripJoinParam('?join=1&tab=chat')).toBe('?tab=chat');
    expect(stripJoinParam('?tab=chat&join=1&section=cost')).toBe('?tab=chat&section=cost');
  });

  it('leaves a search string without the param untouched in meaning', () => {
    expect(stripJoinParam('?tab=chat')).toBe('?tab=chat');
    expect(stripJoinParam('')).toBe('');
  });
});

describe('shouldSwallowJoinDeepLink', () => {
  const viewer = (overrides: Partial<JoinDeepLinkViewer> = {}): JoinDeepLinkViewer => ({
    isParticipantNonGuest: false,
    isGuest: false,
    hasPendingInvite: false,
    isInJoinQueue: false,
    allowDirectJoin: true,
    ...overrides,
  });

  it('runs the join for an outsider', () => {
    expect(shouldSwallowJoinDeepLink(viewer())).toBe(false);
  });

  it('runs the join for the queued player the push targeted', () => {
    // `isParticipantNonGuest` is true for a queue row too — the queue branch
    // must win, or the "Join now" button does nothing for its own audience.
    expect(
      shouldSwallowJoinDeepLink(
        viewer({ isInJoinQueue: true, isParticipantNonGuest: true }),
      ),
    ).toBe(false);
  });

  it('swallows the link when the organizer accepts manually', () => {
    expect(
      shouldSwallowJoinDeepLink(
        viewer({ isInJoinQueue: true, isParticipantNonGuest: true, allowDirectJoin: false }),
      ),
    ).toBe(true);
  });

  it('swallows the link for seats, invites and chat guests', () => {
    expect(shouldSwallowJoinDeepLink(viewer({ isParticipantNonGuest: true }))).toBe(true);
    expect(shouldSwallowJoinDeepLink(viewer({ hasPendingInvite: true }))).toBe(true);
    expect(shouldSwallowJoinDeepLink(viewer({ isGuest: true }))).toBe(true);
  });
});
