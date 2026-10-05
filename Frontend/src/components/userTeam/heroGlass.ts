/**
 * Frosted surface for controls that sit on the team hero's colour wash (the
 * Split dial, the Add-team-photo pill). A flat translucent grey goes muddy over
 * the wash; a light tint + blur + top highlight lets the team's colours read
 * through instead.
 */
export const heroGlass =
  'bg-white/60 backdrop-blur-xl backdrop-saturate-150 ring-1 ring-inset ring-white/80 ' +
  'shadow-[0_10px_28px_-14px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(255,255,255,0.9)] ' +
  'dark:bg-white/[0.08] dark:ring-white/[0.14] ' +
  'dark:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.1)]';
