import type { ParticleShape } from './memberEffectsConfig';

/** Gear outline (8 teeth) with an axle hole; shared by the cog particle and the steampunk spinner. */
export const GEAR_PATH =
  'M10.6 2h2.8l.5 2.6 1.7.7 2.2-1.5 2 2-1.5 2.2.7 1.7 2.6.5v2.8l-2.6.5-.7 1.7 1.5 2.2-2 2-2.2-1.5-1.7.7-.5 2.6h-2.8l-.5-2.6-1.7-.7-2.2 1.5-2-2 1.5-2.2-.7-1.7L2 13.4v-2.8l2.6-.5.7-1.7-1.5-2.2 2-2 2.2 1.5 1.7-.7zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z';

/** Six-arm snowflake strokes; shared by the particle and the nordic spinner. */
export const SNOWFLAKE_PATH =
  'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M12 5.2 9.8 3.4M12 5.2l2.2-1.8M12 18.8l-2.2 1.8M12 18.8l2.2 1.8M5.9 8.5l-.4-2.8M5.9 8.5 3.3 9.6M18.1 15.5l.4 2.8M18.1 15.5l2.6-1.1M5.9 15.5l-2.6-1.1M5.9 15.5l-.4 2.8M18.1 8.5l2.6 1.1M18.1 8.5l.4-2.8';

const FILLED: Partial<Record<ParticleShape, string>> = {
  glint: 'M12 1.5c.6 5.4 3.1 9.9 10.5 10.5-7.4.6-9.9 5.1-10.5 10.5-.6-5.4-3.1-9.9-10.5-10.5C8.9 11.4 11.4 6.9 12 1.5z',
  petal: 'M12 2c4.6 3.8 6 9 3.8 14.2-.9 2.2-2.4 4.4-3.8 5.8-1.4-1.4-2.9-3.6-3.8-5.8C6 11 7.4 5.8 12 2z',
  blossom: 'M8.1 7.3a3.9 3.9 0 1 0 7.8 0a3.9 3.9 0 1 0 -7.8 0zM12.6 10.5a3.9 3.9 0 1 0 7.8 0a3.9 3.9 0 1 0 -7.8 0zM10.9 15.8a3.9 3.9 0 1 0 7.8 0a3.9 3.9 0 1 0 -7.8 0zM5.3 15.8a3.9 3.9 0 1 0 7.8 0a3.9 3.9 0 1 0 -7.8 0zM3.6 10.5a3.9 3.9 0 1 0 7.8 0a3.9 3.9 0 1 0 -7.8 0z',
  droplet: 'M12 2.5c3.6 5 6 8.5 6 11.6A6 6 0 0 1 6 14.1c0-3.1 2.4-6.6 6-11.6z',
  wildflower:
    'M12 3.5a3 3 0 0 1 2.9 3.7 3 3 0 0 1 2.4 5.3 3 3 0 0 1-2 5 3 3 0 0 1-6.6 0 3 3 0 0 1-2-5 3 3 0 0 1 2.4-5.3A3 3 0 0 1 12 3.5zm0 6.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  leaf: 'M20.5 3.5C11 3.5 4.5 8.5 4.5 15c0 1.6.4 3.2 1.1 4.6L3.5 21.7l1.1 1.1 2.1-2.1c1.4.8 3 1.2 4.6 1.2 6.5 0 9.2-8.3 9.2-18.4zM8.6 17.6c2.5-3.6 5.4-6.4 8.6-8.6-2.6 2.8-5.3 5.9-7.4 9.6z',
  speck: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  dust: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z',
  mapleLeaf:
    'M12 1.8l1.9 3.9 2.1-1-.6 4.4 3.2-2.2.6 2 2.8-.4-1.4 3.3 1.6 1-4.7 3.5.6 1.7-4.6-.6V22h-1v-4.6l-4.6.6.6-1.7-4.7-3.5 1.6-1-1.4-3.3 2.8.4.6-2 3.2 2.2-.6-4.4 2.1 1z',
  cog: GEAR_PATH,
  steam:
    'M7.5 18.5a4.5 4.5 0 0 1-.6-9 5.6 5.6 0 0 1 10.6-1.1 4.9 4.9 0 0 1-.4 9.8c-.6.2-1.2.3-1.8.3z',
  spark: 'M12 1l1.6 9.4L12 23l-1.6-12.6z',
  glitch: 'M3 6h18v12H3z',
};

/** One particle glyph, painted in `currentColor`. */
export function MemberParticleShape({ shape }: { shape: ParticleShape }) {
  if (shape === 'snowflake') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <path d={SNOWFLAKE_PATH} />
      </svg>
    );
  }
  if (shape === 'bubble') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path d="M8 9.5a4.5 4.5 0 0 1 3-2.6" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
    );
  }
  if (shape === 'sunburst') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="12" cy="12" r="5" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path
          d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }
  if (shape === 'shaving') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
        <path d="M4 16c2-6 7-9 12-7 3 1.2 3.4 5 .8 6.2-2 .9-3.8-.6-3.2-2.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule={shape === 'blossom' ? 'nonzero' : 'evenodd'}>
      <path d={FILLED[shape]} />
    </svg>
  );
}
