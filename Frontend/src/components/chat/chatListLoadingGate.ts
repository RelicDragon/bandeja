/** Avoid skeleton flash when refetching while rows are already on screen. */
export function shouldEnterChatListLoadingState(
  showedDisk: boolean,
  visibleChatCount: number
): boolean {
  return !showedDisk && visibleChatCount === 0;
}
