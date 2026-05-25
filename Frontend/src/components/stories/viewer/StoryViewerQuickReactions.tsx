import { useMemo } from 'react';
import type { PointerEvent } from 'react';
import { getStoryDmQuickReactions } from './storyDmQuickReactions';

function reactionPointerDown(e: PointerEvent<HTMLButtonElement>) {
  e.stopPropagation();
  if (e.button !== 0) return;
  if (e.pointerType === 'mouse' || e.pointerType === 'pen') e.preventDefault();
}

type StoryViewerQuickReactionsProps = {
  visible: boolean;
  onPick: (emoji: string) => void;
};

export function StoryViewerQuickReactions({ visible, onPick }: StoryViewerQuickReactionsProps) {
  const reactions = useMemo(() => (visible ? getStoryDmQuickReactions() : []), [visible]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 z-[45] flex justify-center px-6"
      style={{ bottom: 'calc(50% - 2rem)' }}
      data-story-interactive
    >
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {reactions.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onPointerDown={(e) => {
              reactionPointerDown(e);
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onPick(emoji);
            }}
            onPointerUp={(e) => e.stopPropagation()}
            className="flex h-14 w-14 items-center justify-center text-[2.75rem] leading-none transition-transform active:scale-110"
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
