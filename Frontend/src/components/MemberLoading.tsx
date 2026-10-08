import type { ReactNode } from 'react';
import type { MemberThemeId } from '@/utils/mainTheme';
import { MemberCrest } from '@/components/navigation/MemberCrest';

interface MemberLoadingProps {
  theme: MemberThemeId;
  /** `screen` fills the viewport with the theme backdrop and art; `inline` is the crest only. */
  variant: 'screen' | 'inline';
  className?: string;
  children?: ReactNode;
}

/**
 * Member-theme loader (docs/domains/premium-appearance.md). Themes style
 * `[data-member-theme='<id>'] .member-loading …`; the backdrop and art slots only show on `screen`.
 */
export function MemberLoading({ theme, variant, className = '', children }: MemberLoadingProps) {
  return (
    <div className={`member-loading member-loading--${variant} ${className}`.trim()}>
      <div className="member-loading-backdrop" aria-hidden="true" />
      <div className="member-loading-art" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="member-loading-mark animate-splash-logo" aria-hidden="true">
        <MemberCrest theme={theme} className="member-loading-crest" />
        <span className="member-loading-glint" />
      </div>
      {children}
    </div>
  );
}
