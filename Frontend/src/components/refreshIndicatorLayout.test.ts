import { describe, expect, it } from 'vitest';
import {
  APP_HEADER_HEIGHT_REM,
  getLegacyRefreshIndicatorBottomPx,
  getRefreshGapLayoutPx,
  getRefreshIndicatorTopCss,
  REFRESH_ACTIVE_PULL_DISTANCE_PX,
} from './refreshIndicatorLayout';

const HEADER_PX = APP_HEADER_HEIGHT_REM * 16;

describe('refreshIndicatorLayout', () => {
  it('centers indicator in pull gap on web (no safe area)', () => {
    const layout = getRefreshGapLayoutPx({
      pullDistance: REFRESH_ACTIVE_PULL_DISTANCE_PX,
      safeAreaTopPx: 0,
    });

    expect(layout.indicatorFitsInGap).toBe(true);
    expect(layout.indicatorBottomPx).toBeLessThan(layout.contentTopPx);
    expect(getRefreshIndicatorTopCss(REFRESH_ACTIVE_PULL_DISTANCE_PX)).toBe(
      `calc(${APP_HEADER_HEIGHT_REM}rem + env(safe-area-inset-top) + 30px)`,
    );
  });

  it('centers indicator in pull gap on Capacitor iOS (notch safe area)', () => {
    const safeAreaTopPx = 47;
    const layout = getRefreshGapLayoutPx({
      pullDistance: REFRESH_ACTIVE_PULL_DISTANCE_PX,
      safeAreaTopPx,
    });

    expect(layout.indicatorFitsInGap).toBe(true);
    expect(layout.indicatorCenterPx).toBe(HEADER_PX + safeAreaTopPx + 30);
    expect(layout.indicatorBottomPx).toBeLessThan(layout.contentTopPx);
  });

  it('centers indicator in pull gap on Capacitor Android (status bar inset)', () => {
    const safeAreaTopPx = 24;
    const layout = getRefreshGapLayoutPx({
      pullDistance: REFRESH_ACTIVE_PULL_DISTANCE_PX,
      safeAreaTopPx,
    });

    expect(layout.indicatorFitsInGap).toBe(true);
    expect(layout.indicatorBottomPx).toBeLessThan(layout.contentTopPx);
  });

  it('documents legacy overlap that overlapped stories at refresh distance', () => {
    const safeAreaTopPx = 47;
    const contentTopPx = HEADER_PX + safeAreaTopPx + REFRESH_ACTIVE_PULL_DISTANCE_PX;
    const legacyBottomPx = getLegacyRefreshIndicatorBottomPx({
      pullDistance: REFRESH_ACTIVE_PULL_DISTANCE_PX,
      safeAreaTopPx,
    });

    expect(legacyBottomPx).toBeGreaterThan(contentTopPx);

    const fixedLayout = getRefreshGapLayoutPx({
      pullDistance: REFRESH_ACTIVE_PULL_DISTANCE_PX,
      safeAreaTopPx,
    });
    expect(fixedLayout.indicatorBottomPx).toBeLessThan(contentTopPx);
  });
});
