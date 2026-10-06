/**
 * `/my-clubs/:clubId/reports` — route and guard are in place (`reports.view`); the report
 * content (`GET /reports`) is built on top of this page.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/clubAdmin/console/primitives';
import { buttonClass } from '@/components/clubAdmin/console/classes';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { sectionPath } from '@/clubAdmin/consoleNav';

export function ClubReportsPage() {
  const { t } = useTranslation('clubAdmin');
  const { clubId } = useClubConsole();
  useConsoleHeader({ title: t('nav.reports') });
  return (
    <div className="mx-auto w-full max-w-2xl p-4 lg:p-6">
      <EmptyState
        icon={BarChart3}
        title={t('reports.emptyTitle')}
        body={t('reports.emptyBody')}
        action={
          <Link to={sectionPath(clubId, 'today')} className={buttonClass('secondary')}>
            {t('reports.openToday')}
          </Link>
        }
      />
    </div>
  );
}
