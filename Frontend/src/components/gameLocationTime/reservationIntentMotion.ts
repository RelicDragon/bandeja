import type { Transition } from 'framer-motion';

export function reservationIntentExpandTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.21, 0.47, 0.32, 0.98] };
}

export function reservationIntentLayoutTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: 'easeInOut' };
}

export function reservationIntentSpringTransition(reduceMotion: boolean): Transition {
  return reduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 };
}

export function reservationIntentStaggerDelay(index: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : index * 0.05;
}
