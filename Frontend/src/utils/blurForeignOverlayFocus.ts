/**
 * Radix/Vaul hide the previous layer with aria-hidden when a new overlay
 * mounts. Chrome blocks that if the previous layer still holds focus
 * (e.g. a court-lobby avatar that just opened the player card).
 */
export function blurForeignOverlayFocus(currentOverlay: HTMLElement | null) {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement) || el === document.body) return;
  if (currentOverlay?.contains(el)) return;
  el.blur();
}
