import { selectTotalAll, useUnreadStore } from '@/store/unreadStore';
import { setAppIconBadgeCountNative } from '@/services/authBridge';
import { isCapacitor } from '@/utils/capacitor';

let installed = false;

/** Sync native app icon badge from projection totals (displayed). */
export function installUnreadNativeBadgeSync(): void {
  if (installed || !isCapacitor()) return;
  installed = true;

  let prevTotal = selectTotalAll(useUnreadStore.getState());
  useUnreadStore.subscribe((state) => {
    const nextTotal = selectTotalAll(state);
    if (nextTotal === prevTotal) return;
    prevTotal = nextTotal;
    void setAppIconBadgeCountNative(nextTotal);
  });
}
