import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { buildClubPath } from '@/deepLinks/catalog';

/**
 * PRD 354 — the chevron beside a club chip in Find's advanced filters, opening
 * the public club page.
 *
 * A sibling of the chip rather than a child of it: nesting an interactive
 * element inside the toggle button would be invalid markup and would swallow
 * the toggle's own click.
 */
export function ClubPageChevron({ clubId, clubName }: { clubId: string; clubName: string }) {
  const { t } = useTranslation();

  return (
    <Link
      to={buildClubPath(clubId)}
      aria-label={t('clubPage.openClubPageNamed', { club: clubName })}
      title={t('clubPage.openClubPage')}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:bg-gray-800 dark:hover:text-primary-400"
    >
      <ChevronRight size={14} className="rtl:rotate-180" aria-hidden />
    </Link>
  );
}
