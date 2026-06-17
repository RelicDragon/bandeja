import {
  CHAT_SCROLL_TARGET_FADE_MS,
  CHAT_SCROLL_TARGET_HOLD_MS,
} from '@/components/chat/chatListMotion';

const TARGET_CLASS = 'message-scroll-target';
const VISIBLE_CLASS = 'message-scroll-target--visible';
const EXITING_CLASS = 'message-scroll-target--exiting';

type HighlightState = {
  holdTimer: number;
  exitTimer?: number;
  onTransitionEnd?: (event: TransitionEvent) => void;
};

const highlightStateByElement = new WeakMap<HTMLElement, HighlightState>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function clearScrollTargetMessageHighlight(element: HTMLElement): void {
  const state = highlightStateByElement.get(element);
  if (state) {
    window.clearTimeout(state.holdTimer);
    if (state.exitTimer != null) window.clearTimeout(state.exitTimer);
    if (state.onTransitionEnd) {
      element.removeEventListener('transitionend', state.onTransitionEnd);
    }
    highlightStateByElement.delete(element);
  }
  element.classList.remove(TARGET_CLASS, VISIBLE_CLASS, EXITING_CLASS);
}

export function applyScrollTargetMessageHighlight(
  element: HTMLElement,
  options?: { reducedMotion?: boolean }
): void {
  clearScrollTargetMessageHighlight(element);
  element.classList.add(TARGET_CLASS);

  const reducedMotion = options?.reducedMotion ?? prefersReducedMotion();

  const finish = () => {
    clearScrollTargetMessageHighlight(element);
  };

  if (reducedMotion) {
    element.classList.add(VISIBLE_CLASS);
    const holdTimer = window.setTimeout(finish, CHAT_SCROLL_TARGET_HOLD_MS);
    highlightStateByElement.set(element, { holdTimer });
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.classList.add(VISIBLE_CLASS);
    });
  });

  const holdTimer = window.setTimeout(() => {
    element.classList.add(EXITING_CLASS);
    element.classList.remove(VISIBLE_CLASS);

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element) return;
      if (event.propertyName !== 'background-color' && event.propertyName !== 'box-shadow') return;
      finish();
    };
    element.addEventListener('transitionend', onTransitionEnd);

    const exitTimer = window.setTimeout(finish, CHAT_SCROLL_TARGET_FADE_MS + 50);
    highlightStateByElement.set(element, { holdTimer, exitTimer, onTransitionEnd });
  }, CHAT_SCROLL_TARGET_FADE_MS + CHAT_SCROLL_TARGET_HOLD_MS);

  highlightStateByElement.set(element, { holdTimer });
}
