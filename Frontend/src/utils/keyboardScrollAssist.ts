const KEYBOARD_GAP_PX = 20;
const TOP_GUARD_PX = 72;

/* Containers we padded so a bottom-most input could scroll above the keyboard.
   Original inline padding is restored when the keyboard hides. */
const paddedContainers = new Map<HTMLElement, string>();

const isScrollableY = (el: HTMLElement): boolean => {
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  const overflowY = window.getComputedStyle(el).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
};

const findScrollContainer = (el: HTMLElement): HTMLElement | null => {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    if (isScrollableY(node)) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
};

/**
 * With Keyboard resize mode "none" the layout viewport never shrinks, so the
 * browser believes inputs under the keyboard are visible and native focus
 * scrolling does nothing. This scrolls the nearest scrollable ancestor so the
 * focused element sits above the keyboard, temporarily padding the container
 * when it has no scroll room left.
 */
export const scrollElementAboveKeyboard = (
  el: HTMLElement,
  keyboardInsetPx: number,
  smooth: boolean,
) => {
  if (keyboardInsetPx <= 0 || !el.isConnected) return;

  const bottomLimit = window.innerHeight - keyboardInsetPx - KEYBOARD_GAP_PX;
  const rect = el.getBoundingClientRect();
  if (rect.bottom <= bottomLimit) return;

  const container = findScrollContainer(el);
  if (!container) return;

  // Never push the element's top under the header / safe area.
  const delta = Math.min(rect.bottom - bottomLimit, Math.max(0, rect.top - TOP_GUARD_PX));
  if (delta <= 0) return;

  if (
    container.scrollTop + delta > container.scrollHeight - container.clientHeight &&
    !paddedContainers.has(container)
  ) {
    paddedContainers.set(container, container.style.paddingBottom);
    container.style.paddingBottom = `${keyboardInsetPx + KEYBOARD_GAP_PX}px`;
  }

  const maxScrollTop = container.scrollHeight - container.clientHeight;
  container.scrollTo({
    top: Math.min(container.scrollTop + delta, maxScrollTop),
    behavior: smooth ? 'smooth' : 'auto',
  });
};

export const releaseKeyboardScrollAssist = () => {
  paddedContainers.forEach((originalPadding, container) => {
    container.style.paddingBottom = originalPadding;
  });
  paddedContainers.clear();
};
