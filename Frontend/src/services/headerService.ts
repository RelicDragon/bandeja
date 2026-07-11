import { invitesApi } from '@/api';
import { queryClient } from '@/queries/queryClient';
import { useHeaderStore } from '../store/headerStore';
import { useAuthStore } from '../store/authStore';
import { countPendingInvites, readMyTabCache } from './myTabCacheReader';

class HeaderService {
  hydratePendingInvitesFromCache(): boolean {
    const { isAuthenticated, user } = useAuthStore.getState();
    if (!isAuthenticated || !user?.id) return false;

    const cached = readMyTabCache(queryClient, user.id);
    if (!cached?.invites) return false;

    useHeaderStore.getState().setPendingInvitesFromServer(countPendingInvites(cached.invites));
    return true;
  }

  fetchPendingInvites() {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated || !navigator.onLine) return;

    invitesApi.getMyInvites('PENDING')
      .then((res) => {
        useHeaderStore.getState().setPendingInvitesFromServer(res.data.length);
      })
      .catch((err) => console.error('Failed to fetch header data:', err));
  }

  startPolling() {
    this.hydratePendingInvitesFromCache();
  }

  stopPolling() {}
}

export const headerService = new HeaderService();
