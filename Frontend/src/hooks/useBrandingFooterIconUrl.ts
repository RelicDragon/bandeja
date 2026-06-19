import { useAuthStore } from '@/store/authStore';
import { getBrandingFooterIconUrl } from '@/services/appIcon.service';

export function useBrandingFooterIconUrl(): string {
  const user = useAuthStore((state) => state.user);
  return getBrandingFooterIconUrl(user);
}
