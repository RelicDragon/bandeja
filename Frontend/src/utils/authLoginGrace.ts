const POST_LOGIN_GRACE_MS = 5000;
let loginCompletedAt = 0;

export function markLoginCompleted(): void {
  loginCompletedAt = Date.now();
}

export function isWithinPostLoginGrace(): boolean {
  return loginCompletedAt > 0 && Date.now() - loginCompletedAt < POST_LOGIN_GRACE_MS;
}
