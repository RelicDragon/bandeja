import type { ArchivedGameChatMeta } from '@/utils/cancelledGameChatStub';

export type LoadedGameChatArchiveState = {
  isGameChatArchived: boolean;
  archivedGameMeta: ArchivedGameChatMeta | null;
};

export function resolveLoadedGameChatArchiveState(
  isLocallyArchived: boolean,
  currentMeta: ArchivedGameChatMeta | null
): LoadedGameChatArchiveState {
  if (isLocallyArchived) {
    return {
      isGameChatArchived: true,
      archivedGameMeta: currentMeta,
    };
  }

  return {
    isGameChatArchived: false,
    archivedGameMeta: null,
  };
}
