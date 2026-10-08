import type { MemberThemeId } from '@/utils/mainTheme';
import { MemberCrest } from '@/components/navigation/MemberCrest';
import './memberShowcase.css';

/**
 * Share-card art in the sharer's member theme (recap story slides and the share
 * sheet swatches). Dark palette (dusk/night for light themes) so white type
 * stays AA; static. The server-rendered share images draw the same motifs
 * (`Backend/src/services/recap/recapThemeArt.ts`).
 */

export function MemberShareBackdrop({ theme, className = '' }: { theme: MemberThemeId; className?: string }) {
  return (
    <span
      className={`member-share-backdrop dark block ${className}`.trim()}
      data-member-theme={theme}
      aria-hidden="true"
    />
  );
}

export function MemberShareFrame({ theme }: { theme: MemberThemeId }) {
  return (
    <span className="member-share-frame dark" data-member-theme={theme} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function MemberShareCrest({ theme }: { theme: MemberThemeId }) {
  return (
    <span className="member-share-crest dark" data-member-theme={theme} aria-hidden="true">
      <MemberCrest theme={theme} />
    </span>
  );
}
