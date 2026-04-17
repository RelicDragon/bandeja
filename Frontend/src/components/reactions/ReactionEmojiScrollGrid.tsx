import { useCallback } from 'react';

export type ReactionEmojiScrollGridProps = {
  emojis: readonly string[];
  selectedEmoji?: string | null;
  onSelect: (emoji: string) => void;
  buttonBaseClass: string;
  buttonSelectedClass: string;
  getButtonTitle?: (emoji: string) => string;
  gridId?: string;
  labelledBy?: string;
  'aria-label'?: string;
};

export function ReactionEmojiScrollGrid({
  emojis,
  selectedEmoji,
  onSelect,
  buttonBaseClass,
  buttonSelectedClass,
  getButtonTitle = (e) => e,
  gridId,
  labelledBy,
  'aria-label': ariaLabel,
}: ReactionEmojiScrollGridProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, emoji: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(emoji);
      }
    },
    [onSelect]
  );

  return (
    <div
      id={gridId}
      role="listbox"
      aria-multiselectable={false}
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
      className="max-h-[min(50vh,280px)] min-h-0 overflow-y-auto overscroll-y-contain [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.55)_transparent] dark:[scrollbar-color:rgba(100,116,139,0.5)_transparent]"
    >
      <div className="grid grid-cols-6 gap-0.5 p-1.5 sm:grid-cols-7">
        {emojis.map((emoji) => {
          const selected = selectedEmoji === emoji;
          return (
            <button
              key={emoji}
              type="button"
              role="option"
              aria-selected={selected}
              title={getButtonTitle(emoji)}
              onClick={() => onSelect(emoji)}
              onKeyDown={(e) => handleKeyDown(e, emoji)}
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-lg leading-none transition-colors sm:size-9 ${buttonBaseClass} ${selected ? buttonSelectedClass : ''}`}
            >
              <span className="select-none">{emoji}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
