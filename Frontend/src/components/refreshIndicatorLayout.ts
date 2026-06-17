export const APP_HEADER_HEIGHT_REM = 4;
export const REFRESH_INDICATOR_HALF_HEIGHT_PX = 22;
export const REFRESH_ACTIVE_PULL_DISTANCE_PX = 60;

export function getRefreshIndicatorTopCss(pullDistance: number): string {
  return `calc(${APP_HEADER_HEIGHT_REM}rem + env(safe-area-inset-top) + ${pullDistance / 2}px)`;
}

export function getRefreshGapLayoutPx(options: {
  pullDistance: number;
  headerHeightPx?: number;
  safeAreaTopPx?: number;
  indicatorHalfHeightPx?: number;
}): {
  contentTopPx: number;
  indicatorCenterPx: number;
  indicatorBottomPx: number;
  gapHeightPx: number;
  indicatorFitsInGap: boolean;
} {
  const headerHeightPx = options.headerHeightPx ?? APP_HEADER_HEIGHT_REM * 16;
  const safeAreaTopPx = options.safeAreaTopPx ?? 0;
  const indicatorHalfHeightPx = options.indicatorHalfHeightPx ?? REFRESH_INDICATOR_HALF_HEIGHT_PX;
  const { pullDistance } = options;

  const headerBottomPx = headerHeightPx + safeAreaTopPx;
  const contentTopPx = headerBottomPx + pullDistance;
  const indicatorCenterPx = headerBottomPx + pullDistance / 2;
  const indicatorBottomPx = indicatorCenterPx + indicatorHalfHeightPx;

  return {
    contentTopPx,
    indicatorCenterPx,
    indicatorBottomPx,
    gapHeightPx: pullDistance,
    indicatorFitsInGap: indicatorBottomPx <= contentTopPx,
  };
}

/** Pre-fix formula: capped offset caused overlap with stories during refresh. */
export function getLegacyRefreshIndicatorBottomPx(options: {
  pullDistance: number;
  headerHeightPx?: number;
  safeAreaTopPx?: number;
  indicatorHeightPx?: number;
}): number {
  const headerHeightPx = options.headerHeightPx ?? APP_HEADER_HEIGHT_REM * 16;
  const safeAreaTopPx = options.safeAreaTopPx ?? 0;
  const indicatorHeightPx = options.indicatorHeightPx ?? REFRESH_INDICATOR_HALF_HEIGHT_PX * 2;
  const headerBottomPx = headerHeightPx + safeAreaTopPx;
  const topPx = headerBottomPx + Math.min(options.pullDistance * 0.6, 40);
  return topPx + indicatorHeightPx;
}
