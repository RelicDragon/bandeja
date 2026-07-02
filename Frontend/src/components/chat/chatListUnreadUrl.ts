export const CHAT_LIST_UNREAD_URL_PARAM = 'unread';

export function isChatListUnreadUrlActive(searchParams: URLSearchParams): boolean {
  return searchParams.get(CHAT_LIST_UNREAD_URL_PARAM) === '1';
}

export function toggleChatListUnreadUrlParam(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  if (next.get(CHAT_LIST_UNREAD_URL_PARAM) === '1') {
    next.delete(CHAT_LIST_UNREAD_URL_PARAM);
  } else {
    next.set(CHAT_LIST_UNREAD_URL_PARAM, '1');
  }
  return next;
}

export function clearChatListUnreadUrlParam(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(CHAT_LIST_UNREAD_URL_PARAM);
  return next;
}
