import { useAuthStore } from '@/store/authStore';
import { activeMemberTheme, type MemberThemeId } from '@/utils/mainTheme';

/** The viewer's active member theme, or null (Classic, non-members, unknown values). */
export function useMemberTheme(): MemberThemeId | null {
  return useAuthStore((s) => activeMemberTheme(s.user));
}
