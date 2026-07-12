/** Scroll modal body until the bottom edge of `target` is visible inside `container`. */
export function scrollToRevealBottom(
  container: HTMLElement,
  target: HTMLElement,
  padding = 16,
  behavior: ScrollBehavior = 'smooth',
): boolean {
  const overflow = target.getBoundingClientRect().bottom - container.getBoundingClientRect().bottom + padding;
  if (overflow <= 0) return false;
  container.scrollBy({ top: overflow, behavior });
  return true;
}

/** After height animations, re-measure and snap scroll so keypad bottom is fully visible. */
export function scheduleScrollToRevealBottom(
  container: HTMLElement,
  target: HTMLElement,
  padding = 16,
): () => void {
  const run = (behavior: ScrollBehavior) => scrollToRevealBottom(container, target, padding, behavior);

  run('smooth');
  const raf = globalThis.requestAnimationFrame(() => run('auto'));
  const t1 = globalThis.setTimeout(() => run('auto'), 240);
  const t2 = globalThis.setTimeout(() => run('auto'), 420);

  return () => {
    globalThis.cancelAnimationFrame(raf);
    globalThis.clearTimeout(t1);
    globalThis.clearTimeout(t2);
  };
}
