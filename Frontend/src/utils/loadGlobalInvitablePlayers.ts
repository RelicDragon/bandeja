import type { BasicUser } from '@/types';
import { usePlayersStore } from '@/store/playersStore';

/** Fresh global invitable list with merged `sportProfiles` in the players store. */
export async function loadGlobalInvitablePlayers(): Promise<BasicUser[]> {
  const store = usePlayersStore.getState();
  store.invalidatePlayersCache();
  return store.fetchPlayers();
}
