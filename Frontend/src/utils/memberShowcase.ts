import type { MainTheme, User } from '@/types';
import { isMemberThemeId, type MemberThemeId } from './mainTheme';
import { showsPremiumStatus } from './premiumIdentity';

/**
 * The member theme shown publicly on a profile (player card hero backdrop) or a
 * share card — docs/domains/premium-appearance.md, "who sees it". Same gate as
 * the other public decorations; the backend already nulls `mainTheme` when the
 * status is hidden, this keeps the client honest for cached or older payloads.
 */
export function publicMemberTheme(
  user: Pick<User, 'isPremium' | 'showPremiumStatus'> & { mainTheme?: MainTheme | null } | null | undefined,
): MemberThemeId | null {
  if (!showsPremiumStatus(user)) return null;
  return isMemberThemeId(user?.mainTheme) ? user.mainTheme : null;
}
