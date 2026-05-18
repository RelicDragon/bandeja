import type { Transition } from 'framer-motion';

export const courtFlipSpring = { type: 'spring', stiffness: 420, damping: 30, mass: 0.65 } as const satisfies Transition;

export const courtFlipMid = { duration: 0.14, ease: [0.45, 0, 0.2, 1] as const } satisfies Transition;

/** Matches change-ends coach strip sinusoidal arrow bounce. */
export const COURT_FLIP_BOUNCE_PX = 5;
export const COURT_FLIP_BOUNCE_DURATION_S = 1.5;
export const COURT_FLIP_BOUNCE_TIMES = [0, 0.25, 0.5, 0.75, 1] as const;

export function courtFlipBounceOffset(axis: 'x' | 'y', sign: 1 | -1): number[] {
  return COURT_FLIP_BOUNCE_TIMES.map((t) => Math.sin(t * Math.PI) * COURT_FLIP_BOUNCE_PX * sign);
}

export const courtFlipBounceTransition = {
  duration: COURT_FLIP_BOUNCE_DURATION_S,
  repeat: Infinity,
  times: [...COURT_FLIP_BOUNCE_TIMES],
  ease: 'linear' as const,
} satisfies Transition;
