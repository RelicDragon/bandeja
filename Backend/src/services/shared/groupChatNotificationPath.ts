/** Frontend path for Telegram/push deep links into a group/channel thread. */
export function resolveGroupChatNotificationPath(groupChannel: {
  id: string;
  bug?: unknown;
  marketItem?: unknown;
}): string {
  if (groupChannel.bug) return `/bugs/${groupChannel.id}`;
  if (groupChannel.marketItem) return `/channel-chat/${groupChannel.id}?filter=market`;
  return `/group-chat/${groupChannel.id}`;
}
