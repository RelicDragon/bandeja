import { describe, expect, it } from 'vitest';
import {
  isThreadComposerInitializing,
  isThreadMessagesPending,
} from './threadViewLoadingState';

describe('threadViewLoadingState', () => {
  it('shows loading while bootstrap flags are active', () => {
    expect(isThreadMessagesPending(true, true)).toBe(true);
    expect(isThreadMessagesPending(true, false)).toBe(true);
    expect(isThreadMessagesPending(false, true)).toBe(true);
  });

  it('allows empty state after offline network failure clears bootstrap flags', () => {
    expect(isThreadMessagesPending(false, false)).toBe(false);
    expect(isThreadComposerInitializing(false, false, false)).toBe(false);
  });

  it('keeps composer disabled while thread is still settling', () => {
    expect(isThreadComposerInitializing(false, false, true)).toBe(true);
  });
});
