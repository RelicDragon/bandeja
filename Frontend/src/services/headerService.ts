import { invitesApi } from '@/api';
import { useHeaderStore } from '../store/headerStore';
import { useAuthStore } from '../store/authStore';

class HeaderService {
  fetchPendingInvites() {
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated || !navigator.onLine) return;

    invitesApi.getMyInvites('PENDING')
      .then((res) => {
        useHeaderStore.getState().setPendingInvites(res.data.length);
      })
      .catch((err) => console.error('Failed to fetch header data:', err));
  }

  startPolling() {
    this.fetchPendingInvites();
  }

  stopPolling() {}
}

export const headerService = new HeaderService();
