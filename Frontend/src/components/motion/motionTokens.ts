import type { Transition } from 'framer-motion';

export const PANEL_ENTER_Y = 14;
export const PANEL_EXIT_Y = -10;
export const PANEL_TRANSITION: Transition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
};

export const CONTENT_ENTER_Y = 16;
export const CONTENT_TRANSITION: Transition = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1],
};

export const LAYOUT_TRANSITION: Transition = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1],
};

export const STAGGER_CHILDREN = 0.06;
export const STAGGER_DELAY_CHILDREN = 0.08;
export const STAGGER_ITEM_TRANSITION: Transition = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1],
};
