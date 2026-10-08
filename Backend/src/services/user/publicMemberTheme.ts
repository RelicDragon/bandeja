import type { MainTheme } from '@prisma/client';

type MemberThemeSource = {
  isPremium?: boolean | null;
  showPremiumStatus?: boolean | null;
  mainTheme?: MainTheme | string | null;
};

/**
 * The member theme a viewer may see as a public showcase (profile backdrop,
 * shared recap art) — docs/domains/premium-appearance.md, "who sees it".
 *
 * Same gate as every other public premium decoration: an active membership and
 * `showPremiumStatus` not switched off. `classic` and unknown values are null.
 * Only single-user projections (player card stats, the owner's recap) carry it;
 * list selects never do.
 */
export function publicMemberTheme(user: MemberThemeSource | null | undefined): MainTheme | null {
  if (!user || user.isPremium !== true || user.showPremiumStatus === false) return null;
  const theme = user.mainTheme;
  if (typeof theme !== 'string' || theme === 'classic' || theme.length === 0) return null;
  return theme as MainTheme;
}
