import { describe, expect, it } from 'vitest';
import { createBugCreateSubmitSession } from './bugCreateSubmitSession';

describe('createBugCreateSubmitSession', () => {
  it('rejects a second begin while in flight', () => {
    const session = createBugCreateSubmitSession();
    expect(session.begin()).toBe(1);
    expect(session.begin()).toBeNull();
  });

  it('allows begin after finish of the current generation', () => {
    const session = createBugCreateSubmitSession();
    const generation = session.begin();
    session.finish(generation!);
    expect(session.begin()).toBe(2);
  });

  it('ignores finish for a stale generation after invalidate', () => {
    const session = createBugCreateSubmitSession();
    const generation = session.begin()!;
    session.invalidate();
    session.finish(generation);
    expect(session.isCurrent(generation)).toBe(false);
    expect(session.begin()).toBe(3);
  });

  it('marks the in-flight generation stale on invalidate', () => {
    const session = createBugCreateSubmitSession();
    const generation = session.begin()!;
    expect(session.isCurrent(generation)).toBe(true);
    session.invalidate();
    expect(session.isCurrent(generation)).toBe(false);
  });
});
