import { motion } from 'framer-motion';
import { noviceRankVisual } from './noviceCelebrationMeta';

type NoviceRankEmblemProps = {
  rank: number;
  size?: 'sm' | 'lg';
  /** Spring in from small (the rank-up "landing"). */
  pop?: boolean;
  reduceMotion?: boolean;
};

/** Round rank emblem: gradient disc + rank icon, soft glow behind. */
export function NoviceRankEmblem({ rank, size = 'lg', pop = false, reduceMotion = false }: NoviceRankEmblemProps) {
  const visual = noviceRankVisual(rank);
  const Icon = visual.icon;
  const disc = size === 'lg' ? 'h-28 w-28' : 'h-9 w-9';
  const icon = size === 'lg' ? 56 : 18;

  return (
    <div className={`relative flex items-center justify-center ${disc}`} data-testid={`novice-rank-emblem-${rank}`}>
      {size === 'lg' && (
        <div className={`pointer-events-none absolute -inset-6 rounded-full blur-2xl ${visual.glow}`} aria-hidden />
      )}
      <motion.div
        className={`relative flex items-center justify-center rounded-full bg-gradient-to-br shadow-lg ${disc} ${visual.gradient}`}
        initial={pop && !reduceMotion ? { scale: 0.4, rotate: -14, opacity: 0 } : false}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      >
        <Icon size={icon} className="text-white drop-shadow" strokeWidth={2.25} aria-hidden />
      </motion.div>
    </div>
  );
}
