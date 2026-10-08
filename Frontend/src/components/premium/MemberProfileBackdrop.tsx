import type { MemberThemeId } from '@/utils/mainTheme';
import './memberShowcase.css';

interface MemberProfileBackdropProps {
  /** The profile owner's public theme (`publicMemberTheme`), never the viewer's. */
  theme: MemberThemeId;
}

/**
 * A still of the member's theme header art behind the player card hero, with a
 * scrim for the white hero type. Fills the nearest positioned ancestor and
 * inherits its corner radius; render it first so the hero content stacks above.
 */
export function MemberProfileBackdrop({ theme }: MemberProfileBackdropProps) {
  return (
    <div
      className="member-profile-backdrop dark"
      data-member-theme={theme}
      data-testid="member-profile-backdrop"
      aria-hidden="true"
    />
  );
}
