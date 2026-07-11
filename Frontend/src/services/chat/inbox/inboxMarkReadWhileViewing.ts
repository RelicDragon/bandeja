import type { ChatContextType } from '@/api/chat';
import { bugsApi } from '@/api/bugs';
import type { ChatItem } from '@/components/chat/chatListTypes';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import { markContextReadOnUserActivity } from '@/services/chat/unreadCoordinator';
import { bugChannelIdFromMeta } from '@/services/chat/unreadSnapshot';
import { useUnreadStore } from '@/store/unreadStore';

const bugChannelResolveInflight = new Map<string, Promise<string | null>>();

function findGameInList(list: ChatItem[], gameId: string) {
  const row = list.find((c) => c.type === 'game' && c.data.id === gameId);
  return row?.type === 'game' ? row.data : null;
}

function findBugChannelId(list: ChatItem[], bugId: string): string | undefined {
  const row = list.find(
    (c) =>
      (c.type === 'group' || c.type === 'channel') &&
      (c.data.bug?.id === bugId || c.data.bugId === bugId)
  );
  return row && (row.type === 'group' || row.type === 'channel') ? row.data.id : undefined;
}

function markBugChannelRead(bugId: string, channelId: string): void {
  useUnreadStore.getState().patchGroupChannelMeta(channelId, { bugId, isChannel: true });
  markContextReadOnUserActivity({
    contextType: 'GROUP',
    contextId: channelId,
    rawContextType: 'BUG',
    groupChannelId: channelId,
    forceMarkReadNetwork: true,
  });
}

async function resolveBugChannelId(bugId: string, list: ChatItem[]): Promise<string | null> {
  const fromList = findBugChannelId(list, bugId);
  if (fromList) return fromList;

  const meta = useUnreadStore.getState().groupChannelMeta;
  const fromMeta = bugChannelIdFromMeta(bugId, meta);
  if (fromMeta) return fromMeta;

  const inflight = bugChannelResolveInflight.get(bugId);
  if (inflight) return inflight;

  const promise = bugsApi
    .getBugById(bugId)
    .then((res) => res.data?.groupChannel?.id ?? null)
    .catch(() => null)
    .finally(() => {
      bugChannelResolveInflight.delete(bugId);
    });
  bugChannelResolveInflight.set(bugId, promise);
  return promise;
}

/** Desktop split-pane: sync server read cursor for the thread currently in view. */
export function markInboxContextReadWhileViewing(
  contextType: ChatContextType | string,
  contextId: string,
  list: ChatItem[],
  userId: string | undefined
): void {
  if (!userId) return;

  if (contextType === 'USER') {
    markContextReadOnUserActivity({
      contextType: 'USER',
      contextId,
      rawContextType: 'USER',
      forceMarkReadNetwork: true,
    });
    return;
  }

  if (contextType === 'GAME') {
    const game = findGameInList(list, contextId);
    const built = buildGameChatMarkReadParams({
      id: contextId,
      contextType: 'GAME',
      game,
      userId,
      gameChatType: 'PUBLIC',
    });
    if (built) {
      markContextReadOnUserActivity({ ...built, forceMarkReadNetwork: true });
      return;
    }
    markContextReadOnUserActivity({
      contextType: 'GAME',
      contextId,
      rawContextType: 'GAME',
      forceMarkReadNetwork: true,
    });
    return;
  }

  if (contextType === 'GROUP') {
    markContextReadOnUserActivity({
      contextType: 'GROUP',
      contextId,
      rawContextType: 'GROUP',
      forceMarkReadNetwork: true,
    });
    return;
  }

  if (contextType === 'BUG') {
    const meta = useUnreadStore.getState().groupChannelMeta;
    const channelId = findBugChannelId(list, contextId) ?? bugChannelIdFromMeta(contextId, meta);
    if (channelId) {
      markBugChannelRead(contextId, channelId);
      return;
    }
    void resolveBugChannelId(contextId, list).then((resolved) => {
      if (resolved) markBugChannelRead(contextId, resolved);
    });
  }
}
