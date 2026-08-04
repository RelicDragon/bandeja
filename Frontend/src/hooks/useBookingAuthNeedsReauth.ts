import { useSyncExternalStore } from 'react';
import {
  bookingAuthNeedsReauth,
  getBookingAuthReauthSnapshot,
  subscribeBookingAuthReauth,
} from '@/integrations/booking/bookingAuthReauthRegistry';

function getServerSnapshot(): boolean {
  return false;
}

export function useBookingAuthNeedsReauth(clubId: string | undefined): boolean {
  return useSyncExternalStore(
    subscribeBookingAuthReauth,
    () => (clubId ? bookingAuthNeedsReauth(clubId) : false),
    getServerSnapshot,
  );
}

export function useBookingAuthReauthClubIds(): string[] {
  return useSyncExternalStore(
    subscribeBookingAuthReauth,
    () => [...getBookingAuthReauthSnapshot().keys()],
    () => [] as string[],
  );
}
