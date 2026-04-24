import { useAuthStore } from '@/store/authStore';
import { useProfileNameGateStore } from '@/store/profileNameGateStore';

export function isProfileNameSet(): boolean {
  return useAuthStore.getState().user?.nameIsSet === true;
}

export function runWithProfileName(action: () => void | Promise<void>): void {
  const user = useAuthStore.getState().user;
  if (!user) return;
  if (user.nameIsSet === true) {
    void Promise.resolve(action());
    return;
  }
  useProfileNameGateStore.getState().openWithPending(action);
}
