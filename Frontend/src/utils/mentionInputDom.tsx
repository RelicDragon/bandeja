import type { ReactNode } from 'react';
import type { SuggestionDataItem } from 'react-mentions';
import type { MentionableUser } from '@/utils/mentionableUsers';
import { isAllMentionId, ALL_MENTION_DISPLAY } from '@/utils/mentionAll';
import { MentionSuggestionAvatar } from '@/components/MentionSuggestionAvatar';
import { Users } from 'lucide-react';

export function renderMentionSuggestionEntry(
  entry: SuggestionDataItem,
  mentionableUsers: MentionableUser[]
): ReactNode {
  if (isAllMentionId(String(entry.id))) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
          <Users size={14} />
        </div>
        <span>{ALL_MENTION_DISPLAY}</span>
      </div>
    );
  }

  const user =
    (entry as SuggestionDataItem & { user?: MentionableUser }).user ||
    mentionableUsers.find((u) => u.id === entry.id);
  if (!user) return <span>{entry.display}</span>;

  return (
    <div className="flex items-center gap-2">
      <MentionSuggestionAvatar user={user} />
      <span>{entry.display}</span>
    </div>
  );
}

/** Grow textarea height without resetting to 0 (avoids ResizeObserver feedback loops). */
export function syncMentionTextareaHeight(
  textarea: HTMLTextAreaElement | null | undefined,
  minH = 48,
  maxH = 120
): void {
  if (!textarea) return;

  const prevControlHeight = textarea.parentElement
    ? (textarea.parentElement as HTMLElement).style.height
    : '';

  textarea.style.height = `${minH}px`;
  const next = Math.min(maxH, Math.max(minH, textarea.scrollHeight));
  const nextPx = `${next}px`;

  if (textarea.style.height !== nextPx) {
    textarea.style.height = nextPx;
  }

  const control = textarea.parentElement;
  if (control && prevControlHeight !== nextPx) {
    (control as HTMLElement).style.height = nextPx;
  }
}
