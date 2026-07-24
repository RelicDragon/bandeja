import { describe, expect, it } from 'vitest';
import {
  decideInitialLoadTailPin,
  shouldAdoptOpenAtBottomFromInitialScroll,
  shouldClearOpenAtBottomIntent,
  shouldPinAfterAsyncReconcile,
  shouldPinAfterSettlingEnds,
  shouldReleaseBottomIntentOnViewportTick,
} from './messageListOpenBottomIntent';

describe('shouldClearOpenAtBottomIntent', () => {
  it('clears when user left the tail outside settling', () => {
    expect(
      shouldClearOpenAtBottomIntent({
        layoutSettling: false,
        nearBottom: false,
        programmaticScroll: false,
      })
    ).toBe(true);
  });

  it('keeps intent during settling (height growth can look mid-history)', () => {
    expect(
      shouldClearOpenAtBottomIntent({
        layoutSettling: true,
        nearBottom: false,
        programmaticScroll: false,
      })
    ).toBe(false);
  });

  it('ignores programmatic pin scrolls', () => {
    expect(
      shouldClearOpenAtBottomIntent({
        layoutSettling: false,
        nearBottom: false,
        programmaticScroll: true,
      })
    ).toBe(false);
  });
});

describe('shouldReleaseBottomIntentOnViewportTick', () => {
  const base = {
    layoutSettling: false,
    programmaticScroll: false,
    nearBottom: false,
    scrollMoved: false,
    heightGrew: false,
    openAtBottomIntent: true,
  };

  it('releases on real scroll away from tail', () => {
    expect(shouldReleaseBottomIntentOnViewportTick({ ...base, scrollMoved: true })).toBe('release');
  });

  it('re-pins when content grows under a pinned tail without scrollTop moving', () => {
    expect(shouldReleaseBottomIntentOnViewportTick({ ...base, heightGrew: true })).toBe('repin');
  });

  it('does not re-pin height growth when open-at-bottom intent is already gone', () => {
    expect(
      shouldReleaseBottomIntentOnViewportTick({
        ...base,
        heightGrew: true,
        openAtBottomIntent: false,
      })
    ).toBe('keep');
  });

  it('prefers release when scroll moved even if height also grew', () => {
    expect(
      shouldReleaseBottomIntentOnViewportTick({
        ...base,
        scrollMoved: true,
        heightGrew: true,
      })
    ).toBe('release');
  });

  it('keeps intent while settling or programmatic', () => {
    expect(shouldReleaseBottomIntentOnViewportTick({ ...base, layoutSettling: true })).toBe('keep');
    expect(shouldReleaseBottomIntentOnViewportTick({ ...base, programmaticScroll: true })).toBe(
      'keep'
    );
  });

  it('releases on real scroll away even during open settling', () => {
    expect(
      shouldReleaseBottomIntentOnViewportTick({
        ...base,
        layoutSettling: true,
        scrollMoved: true,
      })
    ).toBe('release');
  });

  it('re-pins height growth during settling when intent is still live', () => {
    expect(
      shouldReleaseBottomIntentOnViewportTick({
        ...base,
        layoutSettling: true,
        heightGrew: true,
      })
    ).toBe('repin');
  });
});

describe('shouldAdoptOpenAtBottomFromInitialScroll', () => {
  it('adopts at-bottom open plan while intent is live', () => {
    expect(
      shouldAdoptOpenAtBottomFromInitialScroll({
        initialScrollAtBottom: true,
        userReleasedBottomIntent: false,
      })
    ).toBe(true);
  });

  it('never resurrects at-bottom after user left the tail', () => {
    expect(
      shouldAdoptOpenAtBottomFromInitialScroll({
        initialScrollAtBottom: true,
        userReleasedBottomIntent: true,
      })
    ).toBe(false);
  });

  it('does not adopt non-bottom open plans as at-bottom', () => {
    expect(
      shouldAdoptOpenAtBottomFromInitialScroll({
        initialScrollAtBottom: false,
        userReleasedBottomIntent: false,
      })
    ).toBe(false);
  });
});

describe('decideInitialLoadTailPin', () => {
  it('smooth-pins only while still near bottom', () => {
    expect(decideInitialLoadTailPin({ openAtBottom: true, nearBottom: true })).toBe('smooth');
  });

  it('does not force-align when user scrolled into history during load', () => {
    expect(decideInitialLoadTailPin({ openAtBottom: true, nearBottom: false })).toBe('none');
  });

  it('skips when open was not at bottom', () => {
    expect(decideInitialLoadTailPin({ openAtBottom: false, nearBottom: true })).toBe('none');
  });
});

describe('shouldPinAfterSettlingEnds', () => {
  it('pins only when still at tail', () => {
    expect(shouldPinAfterSettlingEnds({ openAtBottom: true, nearBottom: true })).toBe(true);
    expect(shouldPinAfterSettlingEnds({ openAtBottom: true, nearBottom: false })).toBe(false);
  });
});

describe('shouldPinAfterAsyncReconcile', () => {
  it('pins only when reconcile wants pin and live viewport is still at tail', () => {
    expect(shouldPinAfterAsyncReconcile({ reconcileWantsPin: true, liveNearBottom: true })).toBe(true);
    expect(shouldPinAfterAsyncReconcile({ reconcileWantsPin: true, liveNearBottom: false })).toBe(
      false
    );
    expect(shouldPinAfterAsyncReconcile({ reconcileWantsPin: false, liveNearBottom: true })).toBe(
      false
    );
  });

  it('refuses pin when open-scroll intent was released', () => {
    expect(
      shouldPinAfterAsyncReconcile({
        reconcileWantsPin: true,
        liveNearBottom: true,
        openScrollAtBottom: false,
      })
    ).toBe(false);
  });
});
