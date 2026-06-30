import { bugsApi } from '@/api/bugs';
import { useUnreadStore } from '@/store/unreadStore';

const pendingBugChannelLookups = new Map<string, Promise<string | null>>();

export function resolveBugChannelIdFromStore(bugId: string): string | null {
  const state = useUnreadStore.getState();
  const mapped = state.bugIdToChannelId[bugId];
  if (mapped) return mapped;
  for (const [channelId, gm] of Object.entries(state.groupChannelMeta)) {
    if (gm.bugId === bugId) return channelId;
  }
  return null;
}

async function fetchBugChannelId(bugId: string): Promise<string | null> {
  const existing = pendingBugChannelLookups.get(bugId);
  if (existing) return existing;

  const promise = bugsApi
    .getBugById(bugId)
    .then((res) => res.data?.groupChannel?.id ?? null)
    .catch(() => null)
    .finally(() => {
      pendingBugChannelLookups.delete(bugId);
    });

  pendingBugChannelLookups.set(bugId, promise);
  return promise;
}

export async function resolveBugChannelId(bugId: string): Promise<string | null> {
  const fromStore = resolveBugChannelIdFromStore(bugId);
  if (fromStore) return fromStore;

  const channelId = await fetchBugChannelId(bugId);
  if (channelId) {
    useUnreadStore.getState().registerBugChannels([{ id: channelId, bugId }]);
  }
  return channelId;
}

export function applyUnresolvedBugSocketDelta(bugId: string, unreadCount: number): void {
  void resolveBugChannelId(bugId).then((channelId) => {
    if (!channelId) return;
    useUnreadStore.getState().applySocketDelta({
      contextType: 'GROUP',
      contextId: channelId,
      unreadCount,
    });
  });
}
