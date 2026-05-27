import { AnimatePresence } from 'framer-motion';
import type { MouseEvent, SyntheticEvent } from 'react';
import { QuickReactionButton } from '../reactions/QuickReactionButton';
import { ReactionChip } from '../reactions/ReactionChip';

/** Reserved beside the bubble so absolute reactions do not change bubble width. */
export const MESSAGE_REACTION_GUTTER_CLASS = 'w-9 shrink-0';

const stopBubbleGesture = (e: SyntheticEvent) => e.stopPropagation();

type MessageItemReactionStripProps = {
  isOwnMessage: boolean;
  isChannel: boolean;
  activeEmoji: string | undefined;
  reactionCounts: Record<string, number>;
  pending: boolean;
  onQuickReaction: (e: MouseEvent<HTMLButtonElement>) => void;
  suppressOpenReactionMotion?: boolean;
};

export function MessageItemReactionStrip({
  isOwnMessage,
  isChannel,
  activeEmoji,
  reactionCounts,
  pending,
  onQuickReaction,
  suppressOpenReactionMotion = false,
}: MessageItemReactionStripProps) {
  const anchorOwn = isOwnMessage && !isChannel;
  const otherEntries = Object.entries(reactionCounts).filter(([emoji]) => emoji !== activeEmoji);

  return (
    <div
      className={`flex items-center gap-0.5 ${anchorOwn ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseDown={stopBubbleGesture}
      onMouseUp={stopBubbleGesture}
      onMouseLeave={stopBubbleGesture}
      onTouchStart={stopBubbleGesture}
      onTouchEnd={stopBubbleGesture}
      onTouchCancel={stopBubbleGesture}
    >
      <QuickReactionButton
        activeEmoji={activeEmoji}
        count={activeEmoji ? reactionCounts[activeEmoji] || 1 : 1}
        pending={pending}
        onClick={onQuickReaction}
        disabled={pending}
        suppressOpenMotion={suppressOpenReactionMotion}
      />

      <AnimatePresence mode="popLayout" initial={false}>
        {otherEntries.map(([emoji, count]) => (
          <ReactionChip
            key={emoji}
            emoji={emoji}
            count={count}
            suppressOpenMotion={suppressOpenReactionMotion}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
