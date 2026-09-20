import { useEffect, useRef } from 'react';

/**
 * Outside-press + Escape dismissal for a hand-rolled popover.
 *
 * The house pattern (`Select.tsx`, `GameTypeDropdown.tsx`,
 * `MessageInputAttachMenu.tsx`, `AvailabilityCopyMenu.tsx`) is a document
 * listener scoped by a container ref plus an Escape `keydown`; this packages it
 * so a popover cannot ship with only half of it.
 *
 * `pointerdown` rather than `mousedown`: on iOS WKWebView a tap dispatches
 * `pointerdown` immediately, while the synthetic `mousedown` only arrives after
 * `touchend` and is suppressed entirely when the touch is consumed elsewhere —
 * which is exactly how the roster menu ended up impossible to dismiss on a
 * phone. The listener is registered in the capture phase so a child that stops
 * propagation cannot strand the popover either.
 *
 * Returns the ref to put on the element that wraps **both** the trigger and the
 * panel, so pressing the trigger to close does not re-open it.
 *
 * `onDismiss` is told *why*: return focus to the trigger on `'escape'` (the
 * keyboard user is still there), but never on `'outside'` — the pointer user
 * has already moved on and yanking focus back would re-open soft keyboards.
 */
export type PopoverDismissReason = 'outside' | 'escape';

export function usePopoverDismiss<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  onDismiss: (reason: PopoverDismissReason) => void,
) {
  const containerRef = useRef<T>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      dismissRef.current('outside');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dismissRef.current('escape');
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return containerRef;
}
