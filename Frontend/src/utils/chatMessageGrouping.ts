import type { ChatMessage } from '@/api/chat';

export type MessageGroupPosition = 'single' | 'first' | 'middle' | 'last';

/** Max gap between consecutive messages of one sender to keep them in one visual group. */
export const MESSAGE_GROUP_WINDOW_MS = 4 * 60_000;

function calendarDayKey(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function belongsToSameGroup(a: ChatMessage | undefined, b: ChatMessage | undefined): boolean {
  if (!a || !b) return false;
  if (!a.senderId || !b.senderId) return false;
  if (a.senderId !== b.senderId) return false;
  if (calendarDayKey(a.createdAt) !== calendarDayKey(b.createdAt)) return false;
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(tb - ta) <= MESSAGE_GROUP_WINDOW_MS;
}

/** Visual position of a message inside a consecutive same-sender run. */
export function getMessageGroupPosition(
  messages: ChatMessage[],
  index: number
): MessageGroupPosition {
  const message = messages[index];
  const groupsWithPrev = belongsToSameGroup(messages[index - 1], message);
  const groupsWithNext = belongsToSameGroup(message, messages[index + 1]);
  if (groupsWithPrev && groupsWithNext) return 'middle';
  if (groupsWithPrev) return 'last';
  if (groupsWithNext) return 'first';
  return 'single';
}
