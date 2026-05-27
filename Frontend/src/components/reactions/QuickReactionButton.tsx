import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import type { MouseEvent } from 'react';
import { REACTION_PLACEHOLDER_FADE, reactionPopIn, reactionPopOut, reactionStaticShow } from './reactionMotion';

const ICON = 18;

type QuickReactionButtonProps = {
  activeEmoji: string | undefined;
  count: number;
  pending: boolean;
  placeholder?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  /** Skip pop-in on mount (e.g. chat open). */
  suppressOpenMotion?: boolean;
};

export function QuickReactionButton({
  activeEmoji,
  count,
  pending,
  onClick,
  disabled = false,
  className = '',
  suppressOpenMotion = false,
}: QuickReactionButtonProps) {
  const reduceMotion = useReducedMotion();
  const liked = !!activeEmoji;
  const isHeartReaction = activeEmoji === '❤️';
  const showCount = liked && count > 1;

  const showFilledHeart = liked && isHeartReaction;
  const showOtherEmoji = liked && !isHeartReaction;
  const showOutline = !liked;

  const popIn = suppressOpenMotion ? reactionStaticShow() : reactionPopIn(reduceMotion);
  const popOut = reactionPopOut(suppressOpenMotion ? true : reduceMotion);

  return (
    <button
      type="button"
      data-reaction-button="true"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex h-8 w-6 shrink-0 flex-col items-center justify-end rounded-full transition-colors hover:bg-gray-100 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-gray-700 ${className}`}
    >
      <span className="relative flex h-[18px] w-full items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {showOutline && (
            <motion.span
              key="outline"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.75 }}
              transition={REACTION_PLACEHOLDER_FADE}
              style={{ transformOrigin: 'center center' }}
            >
              <Heart size={ICON} className="text-gray-600 dark:text-gray-300" strokeWidth={1.75} />
            </motion.span>
          )}

          {showFilledHeart && (
            <motion.span
              key="filled"
              className="absolute inset-0 flex items-center justify-center"
              variants={{
                hidden: popIn.initial,
                show: { ...popIn.animate, transition: popIn.transition },
                exit: { ...popOut.exit, transition: popOut.transition },
              }}
              initial={suppressOpenMotion ? false : 'hidden'}
              animate="show"
              exit="exit"
              style={{ transformOrigin: 'center center' }}
            >
              <Heart
                size={ICON}
                className={`text-red-500 ${pending ? 'opacity-80' : ''}`}
                fill="currentColor"
                strokeWidth={0}
              />
            </motion.span>
          )}

          {showOtherEmoji && (
            <motion.span
              key={`emoji-${activeEmoji}`}
              className="absolute inset-0 flex items-center justify-center text-[17px] leading-none"
              variants={{
                hidden: popIn.initial,
                show: { ...popIn.animate, transition: popIn.transition },
                exit: { ...popOut.exit, transition: popOut.transition },
              }}
              initial={suppressOpenMotion ? false : 'hidden'}
              animate="show"
              exit="exit"
              style={{ transformOrigin: 'center center' }}
            >
              {activeEmoji}
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span
        className={`h-3 w-full text-center text-[10px] leading-3 tabular-nums text-gray-500 transition-opacity duration-100 dark:text-gray-400 ${showCount ? 'visible' : 'invisible'}`}
        aria-hidden={!showCount}
      >
        {liked ? count || 1 : 1}
      </span>
    </button>
  );
}
