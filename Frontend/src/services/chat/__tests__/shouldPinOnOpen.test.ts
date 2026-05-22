import { describe, expect, it } from 'vitest';
import { shouldPinOnOpen } from '@/services/chat/chatOpenScrollPolicy';

describe('shouldPinOnOpen', () => {
  it('returns false when anchor is saved', () => {
    expect(shouldPinOnOpen({ atBottom: false, anchorMessageId: 'msg-1' }, 'none')).toBe(false);
  });

  it('returns false when reconcile prepended rows', () => {
    expect(shouldPinOnOpen({ atBottom: true, anchorMessageId: null }, 'prepend')).toBe(false);
  });

  it('returns true when at bottom and no prepend', () => {
    expect(shouldPinOnOpen({ atBottom: true, anchorMessageId: null }, 'none')).toBe(true);
  });

  it('returns true when scroll state is missing (default bottom)', () => {
    expect(shouldPinOnOpen(undefined, 'none')).toBe(true);
  });

  it('returns false when explicitly not at bottom', () => {
    expect(shouldPinOnOpen({ atBottom: false, anchorMessageId: null }, 'none')).toBe(false);
  });

  it('allows append delta when at bottom', () => {
    expect(shouldPinOnOpen({ atBottom: true, anchorMessageId: null }, 'append')).toBe(true);
  });
});
