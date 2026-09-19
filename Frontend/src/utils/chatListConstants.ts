export const MAX_PINNED_CHATS = 5;
/** Owned by `ChatListSearchBar`, so typing never re-renders the list until the query settles. */
export const CHAT_LIST_SEARCH_DEBOUNCE_MS = 500;
export const CHAT_LIST_THREAD_INDEX_LIVE_MERGE_MS = 72;

/**
 * Below this the list renders statically with framer `layout` rows, which re-measure
 * every row on every commit. Keep it low so realistic inboxes take the virtualized
 * path (CSS transforms, no layout projection).
 */
export const CHAT_LIST_VIRTUAL_THRESHOLD = 24;
export const CHAT_LIST_VIRTUAL_OVERSCAN = 8;
export const CHAT_LIST_CHAT_ROW_ESTIMATE_PX = 82;
export const CHAT_LIST_CONTACT_ROW_ESTIMATE_PX = 64;
export const CHAT_LIST_MARKET_GROUP_CHANNEL_THRESHOLD = 24;
export const CHAT_LIST_SEARCH_RESULT_ROW_ESTIMATE_PX = 76;

/** Scroll padding so last rows clear overlay tab bar + ClubAdminFab in desktop split view. */
export const DESKTOP_CHAT_LIST_SCROLL_BOTTOM_PAD =
  'calc(5rem + 3rem + max(1rem, env(safe-area-inset-bottom, 0px)))';
