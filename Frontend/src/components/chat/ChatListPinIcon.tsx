import { Pin } from 'lucide-react';

type ChatListPinIconProps = {
  isPinned: boolean;
  className?: string;
};

/** Unpinned: horizontal outline. Pinned: vertical, filled (color from parent). */
export function ChatListPinIcon({ isPinned, className = '' }: ChatListPinIconProps) {
  return (
    <Pin
      className={`w-4 h-4 transition-transform duration-150 ${
        isPinned ? '-rotate-45 fill-current' : 'rotate-45'
      } ${className}`.trim()}
      aria-hidden
    />
  );
}
