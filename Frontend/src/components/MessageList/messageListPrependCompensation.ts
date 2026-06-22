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
