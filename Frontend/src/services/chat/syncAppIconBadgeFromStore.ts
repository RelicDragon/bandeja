import { selectTotalAll, useUnreadStore } from '@/store/unreadStore';
import { setAppIconBadgeCountNative } from '@/services/authBridge';
import { isCapacitor } from '@/utils/capacitor';

/** Reconcile native launcher badge with projection totals (displayed). */
export function syncAppIconBadgeFromStore(count?: number): void {
  if (!isCapacitor()) return;
  const total =
    typeof count === 'number' && Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : selectTotalAll(useUnreadStore.getState());
  void setAppIconBadgeCountNative(total);
}
