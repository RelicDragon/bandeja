import { invitesApi } from '@/api';
import { useHeaderStore } from '../store/headerStore';
import { useAuthStore } from '../store/authStore';

class HeaderService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  startPolling() {
    if (this.intervalId) return; // Already polling

    // Only poll if user is authenticated
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;

    const fetchData = async () => {
      if (!navigator.onLine) {
        console.log('Skipping header data fetch - offline');
        return;
      }
      
      try {
        const invitesResponse = await invitesApi.getMyInvites('PENDING');

        const { setPendingInvites } = useHeaderStore.getState();
        setPendingInvites(invitesResponse.data.length);
      } catch (error) {
        console.error('Failed to fetch header data:', error);
      }
    };

    // Fetch immediately only if online
    if (navigator.onLine) {
    fetchData();
    }

    // Then poll every 30 seconds
    this.intervalId = setInterval(fetchData, 30000);
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const headerService = new HeaderService();
