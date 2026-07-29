export type SharedPlayIntentProgress = 'loading' | 'joining' | null;

export function resolveSharedPlayIntentProgress(input: {
  loading: boolean;
  joining: boolean;
  hasDialogIntent: boolean;
  joinedSport: boolean;
  lobbyRequested: boolean;
}): SharedPlayIntentProgress {
  if (input.loading) return 'loading';
  if (
    (input.joining && !input.hasDialogIntent) ||
    (input.joinedSport && input.lobbyRequested)
  ) {
    return 'joining';
  }
  return null;
}
