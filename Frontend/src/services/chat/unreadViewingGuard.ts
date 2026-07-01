import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';

/** P6 §4.8: suppress unread bumps while the user is in that chat context. */
export function shouldSuppressUnreadForOpenContext(contextType: string, contextId: string): boolean {
  const nav = useGameDetailsChromeStore.getState();
  if (contextType === 'GAME' && nav.viewingGameChatId === contextId) return true;
  if (contextType === 'USER' && nav.viewingUserChatId === contextId) return true;
  if (contextType === 'GROUP' && nav.viewingGroupChannelId === contextId) return true;
  return false;
}
