import { formatDate } from '@/utils/dateFormat';

export const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '😡', '🎉', '🔥'];

export const formatFullDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return formatDate(date, 'MMM d, yyyy HH:mm:ss');
};

export const getUserDisplayName = (user: { firstName?: string; lastName?: string }): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  } else if (user.firstName) {
    return user.firstName;
  } else if (user.lastName) {
    return user.lastName;
  }
  return 'Unknown User';
};

export const getUserInitials = (user: { firstName?: string; lastName?: string }): string => {
  const first = user.firstName?.charAt(0) || '';
  const last = user.lastName?.charAt(0) || '';
  return (first + last).toUpperCase() || 'U';
};

