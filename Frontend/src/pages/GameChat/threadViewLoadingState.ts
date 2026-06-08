/** Message list: loading vs empty — only while fetch/bootstrap flags are active. */
export function isThreadMessagesPending(
  isLoadingMessages: boolean,
  isInitialLoad: boolean,
): boolean {
  return isLoadingMessages || isInitialLoad;
}

/** Composer: disabled while thread open/bootstrap is in flight. */
export function isThreadComposerInitializing(
  isLoadingMessages: boolean,
  isInitialLoad: boolean,
  isThreadOpenSettling: boolean,
): boolean {
  return isLoadingMessages || isInitialLoad || isThreadOpenSettling;
}
