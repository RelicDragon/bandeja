import { describe, expect, it } from 'vitest';
import { isTrackpadPinchWheel } from '../hooks/usePhotoStoryGestures';
import { nextDoubleTapScale, wheelZoomFactor } from './iosGestureFeel';

/**
 * Platform routing contract for story photo gestures.
 * Capacitor / mobile browser / desktop must not double-apply zoom.
 */
describe('story gesture platform routing', () => {
  it('treats ctrl/meta wheel as trackpad pinch (pinch engine owns it)', () => {
    expect(isTrackpadPinchWheel({ ctrlKey: true, metaKey: false } as WheelEvent)).toBe(true);
    expect(isTrackpadPinchWheel({ ctrlKey: false, metaKey: true } as WheelEvent)).toBe(true);
    expect(isTrackpadPinchWheel({ ctrlKey: false, metaKey: false } as WheelEvent)).toBe(false);
  });

  it('mouse wheel without modifiers still zooms via onWheel curve', () => {
    expect(wheelZoomFactor(50, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(-50, 0)).toBeGreaterThan(1);
  });

  it('double-tap toggle works the same on touch and mouse', () => {
    expect(nextDoubleTapScale(1, 1)).toBe(2);
    expect(nextDoubleTapScale(2, 1)).toBe(1);
  });
});
