import type { Transition } from 'framer-motion';

export const PANEL_ENTER_Y = 10;
export const PANEL_EXIT_Y = -8;
export const PANEL_TRANSITION: Transition = {
  duration: 0.24,
  ease: 'easeOut',
};

export const CONTENT_ENTER_Y = 10;
export const CONTENT_TRANSITION: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};

export const LAYOUT_TRANSITION: Transition = {
  duration: 0.32,
  ease: [0.21, 0.47, 0.32, 0.98],
};

export const STAGGER_CHILDREN = 0.05;
export const STAGGER_DELAY_CHILDREN = 0.04;
export const STAGGER_ITEM_TRANSITION: Transition = {
  duration: 0.32,
  ease: [0.21, 0.47, 0.32, 0.98],
};
