import type { Variants } from 'framer-motion';
import {
  CONTENT_ENTER_Y,
  STAGGER_CHILDREN,
  STAGGER_DELAY_CHILDREN,
  STAGGER_ITEM_TRANSITION,
} from '@/components/motion/motionTokens';

export const BOOKING_LIST_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: STAGGER_CHILDREN,
      delayChildren: STAGGER_DELAY_CHILDREN,
    },
  },
};

export const BOOKING_LIST_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: CONTENT_ENTER_Y, scale: 0.99 },
  show: { opacity: 1, y: 0, scale: 1, transition: STAGGER_ITEM_TRANSITION },
};

export const BOOKING_CARD_SKELETON_ITEM_TRANSITION = {
  duration: STAGGER_ITEM_TRANSITION.duration as number,
  delay: 0,
  ease: STAGGER_ITEM_TRANSITION.ease,
};
