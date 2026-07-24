import type { ForwardedFromInfo } from '@/api/chat';
import { navigationService } from '@/services/navigationService';
import type { ChatNavigateOptions } from '@/pages/GameChat/types';

/** Open the source chat for a forwarded message attribution. */
export function navigateToForwardedFromChat(info: ForwardedFromInfo): void {
  const { chatContextType, contextId, isChannel, messageId, chatType } = info;
  if (!contextId || !navigationService.isReady()) return;
  const opts: ChatNavigateOptions = {
    forceReload: true,
    replace: false,
    ...(messageId ? { anchorMessageId: messageId } : {}),
    ...(chatType ? { initialChatType: chatType } : {}),
  };
  if (chatContextType === 'USER') {
    navigationService.navigateToUserChat(contextId, opts);
    return;
  }
  if (chatContextType === 'GAME') {
    navigationService.navigateToGame(contextId, true, opts);
    return;
  }
  if (chatContextType === 'GROUP') {
    if (isChannel) {
      navigationService.navigateToChannelChat(contextId, opts);
    } else {
      navigationService.navigateToGroupChat(contextId, opts);
    }
    return;
  }
  if (chatContextType === 'BUG') {
    void navigationService.navigateToBugChat(contextId, opts);
  }
}

export function navigateToChatContext(
  contextType: ForwardedFromInfo['chatContextType'],
  contextId: string,
  opts?: {
    isChannel?: boolean;
    forceReload?: boolean;
    chatType?: ForwardedFromInfo['chatType'];
    replace?: boolean;
  }
): void {
  const navOpts: ChatNavigateOptions = {
    forceReload: opts?.forceReload !== false,
    replace: opts?.replace,
    ...(opts?.chatType ? { initialChatType: opts.chatType } : {}),
  };
  if (contextType === 'USER') {
    navigationService.navigateToUserChat(contextId, navOpts);
    return;
  }
  if (contextType === 'GAME') {
    navigationService.navigateToGame(contextId, true, navOpts);
    return;
  }
  if (contextType === 'GROUP') {
    if (opts?.isChannel) {
      navigationService.navigateToChannelChat(contextId, navOpts);
    } else {
      navigationService.navigateToGroupChat(contextId, navOpts);
    }
    return;
  }
  if (contextType === 'BUG') {
    void navigationService.navigateToBugChat(contextId, navOpts);
  }
}
