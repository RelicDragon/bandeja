import type { Transition, TargetAndTransition } from 'framer-motion';

const POP_IN: TargetAndTransition = {
  scale: [0.08, 1.65, 0.82, 1.18, 1],
  opacity: [0, 0.2, 0.65, 1, 1],
};

const POP_IN_TRANSITION: Transition = {
  duration: 0.72,
  times: [0, 0.34, 0.52, 0.72, 1],
  ease: [0.22, 1.45, 0.42, 1] as const,
  opacity: { duration: 0.58, ease: [0.4, 0, 0.2, 1] as const },
};

const POP_OUT: TargetAndTransition = {
  scale: [1, 1.28, 0.05],
  opacity: [1, 0.45, 0],
};

const POP_OUT_TRANSITION: Transition = {
  duration: 0.42,
  times: [0, 0.3, 1],
  ease: [0.4, 0, 0.7, 1] as const,
  opacity: { duration: 0.4, ease: [0.4, 0, 1, 1] as const },
};

/** Fade for placeholder heart when swapping to a reaction. */
export const REACTION_PLACEHOLDER_FADE: Transition = {
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1],
};

/** No pop animation (thread open / layout settle). */
export function reactionStaticShow() {
  return {
    initial: { scale: 1, opacity: 1 },
    animate: { scale: 1, opacity: 1 },
    transition: { duration: 0 },
  };
}

export function reactionPopIn(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return {
      initial: { scale: 1, opacity: 1 },
      animate: { scale: 1, opacity: 1 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { scale: 0.08, opacity: 0 },
    animate: POP_IN,
    transition: POP_IN_TRANSITION,
  };
}

export function reactionPopOut(reduceMotion: boolean | null) {
  if (reduceMotion) {
    return {
      exit: { scale: 1, opacity: 0 },
      transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const },
    };
  }
  return {
    exit: POP_OUT,
    transition: POP_OUT_TRANSITION,
  };
}
