export function shouldPreservePreviewDuringRefresh(input: {
  attempt: number;
  hasCurrentPreview: boolean;
  refreshingInitialPreview: boolean;
}): boolean {
  return input.refreshingInitialPreview || (input.attempt > 0 && input.hasCurrentPreview);
}
