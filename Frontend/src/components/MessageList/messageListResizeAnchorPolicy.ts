type ResizeAnchorPolicyInput = {
  isScrolling: boolean;
  itemStart: number;
  scrollOffset: number;
};

export function shouldAdjustForMessageRowResize({
  isScrolling,
  itemStart,
  scrollOffset,
}: ResizeAnchorPolicyInput): boolean {
  return !isScrolling && itemStart < scrollOffset;
}
