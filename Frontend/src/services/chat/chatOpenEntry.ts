/** Bumped before push/deep-link navigation so open pipeline re-runs for the same thread key. */
let freshOpenNonce = 0;

export function bumpChatFreshOpenNonce(): number {
  freshOpenNonce = Date.now();
  return freshOpenNonce;
}

export function peekChatFreshOpenNonce(): number {
  return freshOpenNonce;
}

export function consumeChatFreshOpenNonce(expected: number): void {
  if (freshOpenNonce === expected) freshOpenNonce = 0;
}
