export const serveSpringTransition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.65 } as const;

/** Fallback when player spring onAnimationComplete does not fire. */
export const serveSpringSettleMs = 520;

export const serveThrowEase = [0.12, 0.82, 0.22, 1] as const;

export const serveThrowDuration = 0.58;
