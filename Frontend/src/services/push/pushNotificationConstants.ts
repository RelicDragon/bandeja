export const PUSH_CATEGORY_CHAT_REPLY = 'CHAT_REPLY';
export const PUSH_CATEGORY_INVITE = 'INVITE';
export const PUSH_CATEGORY_TEAM_INVITE = 'TEAM_INVITE';
export const PUSH_CATEGORY_PLAY_INTENT = 'FOLLOWED_USER_PLAY_INTENT';
/** PRD 346 — the reminder category carrying the two attendance answers. */
export const PUSH_CATEGORY_GAME_REMINDER = 'GAME_REMINDER';
/** PRD 345 — "Same time next week?" with "I'm in" / "Not this time". */
export const PUSH_CATEGORY_GAME_SERIES_NEXT_PROMPT = 'GAME_SERIES_NEXT_PROMPT';
/**
 * PRD 357 — two weather categories, because iOS categories are static and the
 * organizer's shade carries two buttons where a participant's carries one.
 * Mirrors `Backend/src/services/push/notifications/game-weather-alert-push.notification.ts`.
 */
export const PUSH_CATEGORY_GAME_WEATHER_ALERT = 'GAME_WEATHER_ALERT';
export const PUSH_CATEGORY_GAME_WEATHER_ALERT_ORGANIZER = 'GAME_WEATHER_ALERT_ORGANIZER';
export const PUSH_ACTION_REPLY = 'reply';
export const PUSH_ACTION_ACCEPT = 'accept';
export const PUSH_ACTION_DECLINE = 'decline';
export const PUSH_ACTION_PLAY_TOO = 'play-too';
/** PRD 346 — must match the action ids the backend signs into the push payload. */
export const PUSH_ACTION_ATTENDANCE_CONFIRM = 'confirm';
export const PUSH_ACTION_ATTENDANCE_UNSURE = 'unsure';
/** PRD 357 — weather alert actions; `keep` is silent, the other two open the app. */
export const PUSH_ACTION_WEATHER_KEEP = 'keep';
export const PUSH_ACTION_WEATHER_MOVE_INDOOR = 'moveIndoor';
export const PUSH_ACTION_WEATHER_FORECAST = 'forecast';
export const PUSH_REPLY_MAX_CONTENT_LENGTH = 4096;
