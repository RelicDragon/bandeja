import type { ChatMessage } from '@/api/chat';
import { isSameYear, isToday, isYesterday } from 'date-fns';
import i18n from '@/i18n/config';
import { formatDate } from '@/utils/dateFormat';

export const CHAT_DATE_SEPARATOR_ESTIMATE_PX = 32;

function calendarDayKey(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function shouldShowChatDateSeparator(messages: ChatMessage[], index: number): boolean {
  const message = messages[index];
  if (!message) return false;
  if (index === 0) return true;
  const prev = messages[index - 1];
  if (!prev) return true;
  return calendarDayKey(message.createdAt) !== calendarDayKey(prev.createdAt);
}

export function formatChatDateSeparatorLabel(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  if (isToday(date)) return i18n.t('chat.dateSeparator.today');
  if (isYesterday(date)) return i18n.t('chat.dateSeparator.yesterday');
  if (!isSameYear(date, new Date())) {
    return formatDate(date, 'd MMMM yyyy');
  }
  return formatDate(date, 'd MMMM');
}

/** Label when a separator should render; null skips the row chrome entirely. */
export function getChatDateSeparatorLabel(messages: ChatMessage[], index: number): string | null {
  if (!shouldShowChatDateSeparator(messages, index)) return null;
  const label = formatChatDateSeparatorLabel(messages[index]!.createdAt);
  return label || null;
}

/** Measured virtual row includes optional separator — cache stores body height only. */
export function stripDateSeparatorFromMeasuredRowHeight(
  measuredPx: number,
  hadDateSeparator: boolean,
): number {
  if (!hadDateSeparator) return measuredPx;
  return Math.max(measuredPx - CHAT_DATE_SEPARATOR_ESTIMATE_PX, 28);
}
