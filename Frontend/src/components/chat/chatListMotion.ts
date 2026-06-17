import type { Transition } from 'framer-motion';

export const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export const CHAT_LIST_LAYOUT_SPRING = {
  type: 'spring' as const,
  stiffness: 210,
  damping: 28,
  mass: 1,
};

export const CHAT_LIST_HEIGHT_TRANSITION = {
  duration: 0.64,
  ease: EASE,
};

export const CHAT_LIST_ROW_MOTION = {
  opacity: { duration: 0.56, ease: EASE },
  y: { duration: 0.56, ease: EASE },
  scale: { duration: 0.56, ease: EASE },
};

export const CHAT_ROW_STAGGER_STEP_S = 0.08;
export const CHAT_ROW_STAGGER_MAX_S = 0.56;

export function chatListRowEnterDelay(index: number): number {
  return Math.min(index * CHAT_ROW_STAGGER_STEP_S, CHAT_ROW_STAGGER_MAX_S);
}

export const CHAT_ROW_EXIT_DURATION_S = 0.36;

export const CHAT_MESSAGE_ROW_EXIT_TRANSITION: Transition = {
  duration: CHAT_ROW_EXIT_DURATION_S,
  ease: EASE,
};

export const CHAT_MESSAGE_ROW_EXIT = {
  opacity: 0,
  scale: 0.96,
  y: -8,
};

export const CHAT_MESSAGE_ROW_EXIT_MS = Math.ceil(CHAT_ROW_EXIT_DURATION_S * 1000) + 40;

export const CHAT_VIRTUAL_ROW_POSITION_TRANSITION =
  'transform 0.64s cubic-bezier(0.21, 0.47, 0.32, 0.98)';

export const CHAT_MESSAGE_ROW_TRANSITION: Transition = {
  duration: 0.64,
  ease: EASE,
};

export const CHAT_MESSAGE_ENTER_X = 12;
export const CHAT_MESSAGE_ENTER_Y = 4;

export const CHAT_PANEL_TRANSITION = {
  duration: 0.48,
  ease: 'easeOut' as const,
};

export const CHAT_PANE_SLIDE_DURATION_S = 0.6;

export const CHAT_PANE_SLIDE_TRANSITION = {
  duration: CHAT_PANE_SLIDE_DURATION_S,
  ease: EASE,
};

export const CHAT_PANE_SLIDE_MS = CHAT_PANE_SLIDE_DURATION_S * 1000;

export const CHAT_PANE_SLIDE_CSS_TRANSITION = `all ${CHAT_PANE_SLIDE_DURATION_S}s cubic-bezier(${EASE.join(', ')})`;

export const CHAT_PANE_SLIDE_OFFSET = 28;

export const CHAT_PINNED_BAR_TRANSITION = {
  duration: 0.5,
  ease: 'easeInOut' as const,
};

export const CHAT_FAB_EXIT_TRANSITION = {
  duration: 0.68,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const CHAT_FAB_SPRING = {
  type: 'spring' as const,
  stiffness: 190,
  damping: 18,
  mass: 1,
};

export const CHAT_ATTACH_FLYOUT_EASE = [0.22, 1, 0.36, 1] as const;

export const CHAT_ATTACH_FLYOUT_CONTAINER = {
  hidden: { transition: { staggerChildren: 0.1, staggerDirection: -1 } },
  visible: { transition: { staggerChildren: 0.14, delayChildren: 0.04 } },
};

export const CHAT_ATTACH_FLYOUT_ITEM = {
  hidden: {
    opacity: 0,
    y: 14,
    transition: { duration: 0.36, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.48, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
};

export const CHAT_MESSAGE_MENU_ROOT = {
  hidden: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};

export const CHAT_MESSAGE_MENU_BACKDROP = {
  hidden: {
    opacity: 0,
    transition: { duration: 0.32, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
};

export const CHAT_MESSAGE_MENU_SHELL = {
  hidden: {
    opacity: 0,
    scale: 0.92,
    y: 12,
    transition: { duration: 0.36, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.48, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
};

export const CHAT_MESSAGE_MENU_INNER = {
  hidden: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.06 } },
};

export const CHAT_MESSAGE_MENU_SECTION = {
  hidden: {
    opacity: 0,
    y: 10,
    transition: { duration: 0.32, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.44, ease: CHAT_ATTACH_FLYOUT_EASE },
  },
};

export const CHAT_LIST_PULL_TRANSITION_S = 0.5;
export const CHAT_LIST_FADE_TRANSITION_S = 0.5;

export const CHAT_SCROLL_TARGET_FADE_S = CHAT_LIST_FADE_TRANSITION_S;
export const CHAT_SCROLL_TARGET_FADE_MS = CHAT_SCROLL_TARGET_FADE_S * 1000;
export const CHAT_SCROLL_TARGET_HIGHLIGHT_FADE_CSS_VAR = '--chat-scroll-highlight-fade-ms';
export const CHAT_SCROLL_TARGET_HOLD_MS = 2000;
export const CHAT_SCROLL_TARGET_SCROLL_DEFER_MS = 320;

export const CHAT_OUTBOX_TRANSITION = {
  duration: 0.4,
  ease: 'easeOut' as const,
};

export const CHAT_PINNED_ITEM_TRANSITION = {
  duration: 0.4,
  ease: 'easeOut' as const,
};

export const CHAT_SEARCH_BAR_TRANSITION = {
  duration: 0.5,
  ease: 'easeInOut' as const,
};

export const CHAT_TAIL_ENTER_MAX_STAGGER_INDEX = Math.floor(
  CHAT_ROW_STAGGER_MAX_S / CHAT_ROW_STAGGER_STEP_S
);

/** Tail-append keys stay "new" until enter motion can finish (stagger + duration). */
export function chatTailEnterMarkSeenMs(staggerIndex = 0): number {
  const duration =
    typeof CHAT_MESSAGE_ROW_TRANSITION.duration === 'number'
      ? CHAT_MESSAGE_ROW_TRANSITION.duration
      : 0.64;
  const delay = chatListRowEnterDelay(staggerIndex);
  return Math.ceil((delay + duration) * 1000) + 80;
}

/** Worst-case tail enter mark-seen delay (max stagger + duration). */
export const CHAT_TAIL_ENTER_MARK_SEEN_MS_MAX = chatTailEnterMarkSeenMs(
  CHAT_TAIL_ENTER_MAX_STAGGER_INDEX
);
