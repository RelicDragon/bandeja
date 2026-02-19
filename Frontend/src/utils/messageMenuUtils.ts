import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { User } from '@/types';

export interface MessagePreviewLike {
  content?: string | null;
  mediaUrls?: string[];
  poll?: { question?: string };
}

export function getMessagePreviewText(message: MessagePreviewLike): string {
  if (message.content && message.content.trim()) {
    return message.content.trim();
  }
  if (message.mediaUrls?.length) {
    return '📷 Photo';
  }
  if (message.poll?.question) {
    return `📊 ${message.poll.question}`;
  }
  return 'Message';
}

export const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '😡', '🎉', '🔥'];

export const formatFullDateTime = (dateString: string, user?: User | null): string => {
  const date = new Date(dateString);
  const displaySettings = user ? resolveDisplaySettings(user) : null;
  if (displaySettings) {
    const timePart = formatGameTime(dateString, displaySettings);
    return `${formatDate(date, 'MMM d, yyyy')} ${timePart}`;
  }
  return formatDate(date, 'MMM d, yyyy HH:mm:ss');
};

export const getUserDisplayName = (user: { firstName?: string; lastName?: string }): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim();
  } else if (user.firstName) {
    return user.firstName || '';
  } else if (user.lastName) {
    return user.lastName || '';
  }
  return 'Unknown User';
};

export const getUserInitials = (user: { firstName?: string; lastName?: string }): string => {
  const first = user.firstName?.charAt(0) || '';
  const last = user.lastName?.charAt(0) || '';
  return (first + last).toUpperCase() || 'U';
};

