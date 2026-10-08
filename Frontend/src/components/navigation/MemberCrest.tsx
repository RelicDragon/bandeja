import type { MemberThemeId } from '@/utils/mainTheme';

export const GOLD_CREST_URL = '/premium/bandeja-gold-crest.webp';

interface MemberCrestProps {
  theme: MemberThemeId;
  className?: string;
}

/**
 * The Bandeja crest in a member theme. Obsidian Gold keeps its raster crest; every other theme
 * paints the crest line mask with `--mt-brand-fill` over the silhouette tinted `--mt-brand-plate`.
 */
export function MemberCrest({ theme, className = '' }: MemberCrestProps) {
  if (theme === 'premium') {
    return <img src={GOLD_CREST_URL} alt="" width={88} height={56} className={`member-crest ${className}`.trim()} />;
  }
  return <span aria-hidden="true" className={`member-crest member-crest--mask ${className}`.trim()} />;
}
