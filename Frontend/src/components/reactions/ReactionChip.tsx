import { motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { reactionPopIn, reactionPopOut, reactionStaticShow } from './reactionMotion';

const ICON = 18;

type ReactionChipProps = {
  emoji: string;
  count: number;
  suppressOpenMotion?: boolean;
};

/** Fixed-size emoji + count stack shared by quick-like and read-only reaction chips. */
export function ReactionChip({ emoji, count, suppressOpenMotion = false }: ReactionChipProps) {
  const reduceMotion = useReducedMotion();
  const showCount = count > 1;
  const isHeart = emoji === '❤️';
  const popIn = suppressOpenMotion ? reactionStaticShow() : reactionPopIn(reduceMotion);
  const popOut = reactionPopOut(suppressOpenMotion ? true : reduceMotion);

  return (
    <motion.div
      layout={!suppressOpenMotion}
      variants={{
        hidden: popIn.initial,
        show: popIn.animate,
        exit: popOut.exit,
      }}
      initial={suppressOpenMotion ? false : 'hidden'}
      animate="show"
      exit="exit"
      transition={{
        show: popIn.transition,
        exit: popOut.transition,
      }}
      className="flex h-8 w-6 flex-col items-center justify-end"
    >
      <span className="flex h-[18px] w-full items-center justify-center">
        {isHeart ? (
          <Heart size={ICON} className="text-red-500" fill="currentColor" strokeWidth={0} />
        ) : (
          <span className="text-sm leading-none">{emoji}</span>
        )}
      </span>
      <span
        className={`h-3 w-full text-center text-[10px] leading-3 tabular-nums text-gray-500 dark:text-gray-400 ${showCount ? 'visible' : 'invisible'}`}
        aria-hidden={!showCount}
      >
        {count}
      </span>
    </motion.div>
  );
}
