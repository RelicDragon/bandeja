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
