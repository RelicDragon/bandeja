import { invitesApi } from '@/api';
import { chatApi } from '@/api/chat';
import { useHeaderStore } from '../store/headerStore';
import { useAuthStore } from '../store/authStore';

class HeaderService {
  private intervalId: number | null = null;

  startPolling() {
    if (this.intervalId) return; // Already polling

    // Only poll if user is authenticated
    const { isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated) return;

    const fetchData = async () => {
      try {
        const [invitesResponse, messagesResponse] = await Promise.all([
          invitesApi.getMyInvites('PENDING'),
          chatApi.getUnreadCount()
        ]);

        const { setPendingInvites, setUnreadMessages } = useHeaderStore.getState();
        setPendingInvites(invitesResponse.data.length);
        setUnreadMessages(messagesResponse.data.count);
      } catch (error) {
        console.error('Failed to fetch header data:', error);
      }
    };

    // Fetch immediately
    fetchData();

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
