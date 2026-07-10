import { selectTotalAll, useUnreadStore } from '@/store/unreadStore';
import { isCapacitor } from '@/utils/capacitor';
import { syncAppIconBadgeFromStore } from '@/services/chat/syncAppIconBadgeFromStore';

let installed = false;

/** Sync native app icon badge from projection totals (displayed). */
export function installUnreadNativeBadgeSync(): void {
  if (installed || !isCapacitor()) return;
  installed = true;

  syncAppIconBadgeFromStore();

  let prevTotal = selectTotalAll(useUnreadStore.getState());
  useUnreadStore.subscribe((state) => {
    const nextTotal = selectTotalAll(state);
    if (nextTotal === prevTotal) return;
    prevTotal = nextTotal;
    syncAppIconBadgeFromStore();
  });
}
