import type { BasicUser } from '@/types';
import { usePlayersStore } from '@/store/playersStore';
import { getResolvedBrowseCityId } from '@/hooks/useResolvedBrowseCity';

/** Fresh invitable list for the current browse city, with merged `sportProfiles`. */
export async function loadGlobalInvitablePlayers(cityId?: string): Promise<BasicUser[]> {
  const store = usePlayersStore.getState();
  store.invalidatePlayersCache();
  return store.fetchPlayers(undefined, undefined, undefined, undefined, {
    cityId: cityId ?? getResolvedBrowseCityId(),
  });
}
