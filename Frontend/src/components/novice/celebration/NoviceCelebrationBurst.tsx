import { motion } from 'framer-motion';
import { MemberCelebrationBurst, useMemberTheme } from '@/features/memberEffects';

const COLORS = ['bg-amber-300', 'bg-emerald-300', 'bg-sky-300', 'bg-fuchsia-300', 'bg-white'] as const;
const COUNT = 18;

/** Deterministic radial burst: angle, distance, size and delay per particle. */
const PARTICLES = Array.from({ length: COUNT }, (_, i) => {
  const angle = (i / COUNT) * Math.PI * 2 + (i % 2 === 0 ? 0.12 : -0.08);
  const distance = 92 + (i % 3) * 26;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    size: 4 + (i % 4) * 2,
    delay: (i % 5) * 0.035,
    color: COLORS[i % COLORS.length],
    round: i % 3 !== 0,
  };
});

/**
 * The rank-up burst — the one place the app allows a confetti-like moment
 * (full-screen novice milestone). Pure framer-motion, renders nothing under
 * reduced motion. Members with a theme get the themed burst instead.
 */
export function NoviceCelebrationBurst({ reduceMotion }: { reduceMotion: boolean }) {
  const memberTheme = useMemberTheme();
  if (memberTheme) return <MemberCelebrationBurst theme={memberTheme} reduceMotion={reduceMotion} surface="dark" radius={128} />;
  if (reduceMotion) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute ${p.color} ${p.round ? 'rounded-full' : 'rounded-[2px]'}`}
          style={{ width: p.size, height: p.size }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.3, rotate: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            x: p.x,
            y: p.y,
            scale: [0.3, 1.15, 1, 0.6],
            rotate: p.round ? 0 : 180,
          }}
          transition={{ duration: 1.1, delay: 0.25 + p.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}
