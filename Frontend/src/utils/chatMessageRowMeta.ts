import type { ChatMessage } from '@/api/chat';
import { formatChatDateSeparatorLabel } from '@/utils/chatDateSeparator';
import { MESSAGE_GROUP_WINDOW_MS, type MessageGroupPosition } from '@/utils/chatMessageGrouping';

export interface ChatMessageRowMeta {
  /** Date separator label per row index, or `null` when the row shows no separator. */
  dateSeparatorLabels: (string | null)[];
  /** Visual position of each row inside its consecutive same-sender run. */
  groupPositions: MessageGroupPosition[];
}

const EMPTY_META: ChatMessageRowMeta = { dateSeparatorLabels: [], groupPositions: [] };

/**
 * Per-row separator labels and grouping in a single O(n) pass.
 *
 * The per-row helpers (`getChatDateSeparatorLabel`, `getMessageGroupPosition`) re-parse
 * `createdAt` for the row and both of its neighbours. Calling them from the virtual-row render
 * meant ~6 date parses per visible row on every scroll frame; this parses each message once per
 * message-list change instead.
 */
export function buildChatMessageRowMeta(messages: ChatMessage[]): ChatMessageRowMeta {
  const count = messages.length;
  if (count === 0) return EMPTY_META;

  const dayKeys = new Array<string>(count);
  const timestamps = new Array<number>(count);

  for (let i = 0; i < count; i++) {
    const createdAt = messages[i].createdAt;
    const date = new Date(createdAt);
    const time = date.getTime();
    if (Number.isNaN(time)) {
      dayKeys[i] = '';
      timestamps[i] = Number.NaN;
      continue;
    }
    dayKeys[i] = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    timestamps[i] = time;
  }

  const dateSeparatorLabels = new Array<string | null>(count);
  const groupPositions = new Array<MessageGroupPosition>(count);

  // `belongsToSameGroup(a, b)` for every adjacent pair — groupsWithPrev[i] is the pair (i-1, i).
  const groupsWithPrev = new Array<boolean>(count);
  groupsWithPrev[0] = false;
  for (let i = 1; i < count; i++) {
    const prev = messages[i - 1];
    const current = messages[i];
    groupsWithPrev[i] =
      !!prev.senderId &&
      !!current.senderId &&
      prev.senderId === current.senderId &&
      dayKeys[i - 1] === dayKeys[i] &&
      Number.isFinite(timestamps[i - 1]) &&
      Number.isFinite(timestamps[i]) &&
      Math.abs(timestamps[i] - timestamps[i - 1]) <= MESSAGE_GROUP_WINDOW_MS;
  }

  for (let i = 0; i < count; i++) {
    const withPrev = groupsWithPrev[i];
    const withNext = i + 1 < count ? groupsWithPrev[i + 1] : false;
    groupPositions[i] =
      withPrev && withNext ? 'middle' : withPrev ? 'last' : withNext ? 'first' : 'single';

    const showsSeparator = i === 0 || dayKeys[i] !== dayKeys[i - 1];
    if (!showsSeparator) {
      dateSeparatorLabels[i] = null;
      continue;
    }
    dateSeparatorLabels[i] = formatChatDateSeparatorLabel(messages[i].createdAt) || null;
  }

  return { dateSeparatorLabels, groupPositions };
}
