const PLAY_INTENT_PUSH_TYPES = new Set([
  'PLAY_INTENT_MATCH',
  'GAME_MATCHES_INTENT',
  'INTENT_PLAYERS_FOR_GAME',
  'FOLLOWED_USER_PLAY_INTENT',
]);

export function isPlayIntentPushType(type: string | null | undefined): boolean {
  return typeof type === 'string' && PLAY_INTENT_PUSH_TYPES.has(type);
}
