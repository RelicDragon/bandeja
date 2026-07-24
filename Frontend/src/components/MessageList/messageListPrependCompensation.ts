export type PrependScrollSnapshot = {
  scrollTop: number;
  scrollHeight: number;
};

export function capturePrependScrollSnapshot(container: HTMLElement): PrependScrollSnapshot {
  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
  };
}

/** Single layout-pass scrollTop adjustment after rows prepend at the top. */
export function applyPrependScrollCompensation(
  container: HTMLElement,
  snapshot: PrependScrollSnapshot
): number {
  const scrollDifference = container.scrollHeight - snapshot.scrollHeight;
  if (scrollDifference <= 0) return 0;
  container.scrollTop = Math.max(0, snapshot.scrollTop + scrollDifference);
  return scrollDifference;
}

/**
 * Follow-up after virtualizer/estimates settle: grow scrollTop by height delta only,
 * preserving whatever scrollTop is now (avoids double-apply from a stale snapshot top).
 */
export function applyPrependScrollHeightGrowth(
  container: HTMLElement,
  previousScrollHeight: number
): number {
  const delta = container.scrollHeight - previousScrollHeight;
  if (delta <= 0) return 0;
  container.scrollTop = Math.max(0, container.scrollTop + delta);
  return delta;
}

export function detectPrependReconcile(params: {
  previousMessageCount: number;
  previousFirstId: string | undefined;
  currentFirstId: string | undefined;
  wasLoadingMore: boolean;
  justLoadedOlder: boolean;
}): boolean {
  const { previousMessageCount, previousFirstId, currentFirstId, wasLoadingMore, justLoadedOlder } =
    params;
  return (
    previousMessageCount > 0 &&
    !wasLoadingMore &&
    !justLoadedOlder &&
    previousFirstId != null &&
    currentFirstId != null &&
    previousFirstId !== currentFirstId
  );
}
