/**
 * Club admin console (`/my-clubs/*`). Routes: picker at `/my-clubs`; per club Today (index),
 * schedule, bookings, reports and the Club area (`club` hub + one route per `CLUB_PAGES` entry,
 * each guarded by its capability). Legacy paths redirect:
 * `reservations` → `bookings`, `courts` → `club/courts`, `settings` → `club/profile`.
 * `GET /context` (legacy fallback: the club row) supplies role, capabilities and the club zone;
 * routes the role cannot use render a forbidden state instead of the page.
 */
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClubAdminCapability } from '@shared/clubAdmin/contract';
import { parseClubAdminError } from '@/api/clubAdminErrors';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/clubAdmin/console/primitives';
import { buttonClass } from '@/components/clubAdmin/console/classes';
import { useClubConsoleContextQuery } from '@/queries/clubAdmin';
import { MyClubsPage } from '@/pages/clubAdmin/MyClubsPage';
import { ClubTodayPage } from '@/pages/clubAdmin/ClubTodayPage';
import { ClubSchedulePage } from '@/pages/clubAdmin/ClubSchedulePage';
import { ClubBookingsPage } from '@/pages/clubAdmin/ClubBookingsPage';
import { ClubReportsPage } from '@/pages/clubAdmin/ClubReportsPage';
import { ClubPaymentsPage } from '@/pages/clubAdmin/ClubPaymentsPage';
import { ClubHubPage } from '@/pages/clubAdmin/ClubHubPage';
import { ClubProfilePage } from '@/pages/clubAdmin/ClubProfilePage';
import { ClubHoursPage } from '@/pages/clubAdmin/ClubHoursPage';
import { ClubCourtsPage } from '@/pages/clubAdmin/ClubCourtsPage';
import { ClubPricingPage } from '@/pages/clubAdmin/ClubPricingPage';
import { ClubTeamPage } from '@/pages/clubAdmin/ClubTeamPage';
import { ClubActivityPage } from '@/pages/clubAdmin/ClubActivityPage';
import { ClubReviewsPage } from '@/pages/clubAdmin/ClubReviewsPage';
import { ClubConsoleProvider } from './ClubConsoleContext';
import { useClubConsole } from './clubConsoleContextValue';
import { ConsoleLayout } from './ConsoleLayout';
import { CLUB_AREA_CAPABILITIES, CLUB_PAGES, consoleBase, hasAny, type ClubPageId } from './consoleNav';

const CLUB_PAGE_COMPONENTS: Record<ClubPageId, () => ReactNode> = {
  profile: ClubProfilePage,
  hours: ClubHoursPage,
  courts: ClubCourtsPage,
  pricing: ClubPricingPage,
  team: ClubTeamPage,
  activity: ClubActivityPage,
  reviews: ClubReviewsPage,
};

function RequireCapability({ anyOf, children }: { anyOf: readonly ClubAdminCapability[]; children: ReactNode }) {
  const { t } = useTranslation('clubAdmin');
  const { context, clubId } = useClubConsole();
  if (hasAny(context.capabilities, anyOf)) return <>{children}</>;
  return (
    <ErrorState
      kind="forbidden"
      body={t('states.forbidden.role')}
      action={
        <Link to={consoleBase(clubId)} replace className={buttonClass('secondary')}>
          {t('nav.today')}
        </Link>
      }
    />
  );
}

/** Absolute redirect inside the console, keeping the query string (e.g. `?date=`). */
function ConsoleRedirect({ to }: { to: string }) {
  const { clubId } = useClubConsole();
  const { search } = useLocation();
  return <Navigate to={`${consoleBase(clubId)}${to ? `/${to}` : ''}${search}`} replace />;
}

function ConsoleRoutes() {
  return (
    <ConsoleLayout>
      {(location) => (
        <Routes location={location}>
          <Route index element={<ClubTodayPage />} />
          <Route
            path="schedule"
            element={
              <RequireCapability anyOf={['schedule.view']}>
                <ClubSchedulePage />
              </RequireCapability>
            }
          />
          <Route
            path="bookings"
            element={
              <RequireCapability anyOf={['bookings.view']}>
                <ClubBookingsPage />
              </RequireCapability>
            }
          />
          <Route path="reservations" element={<ConsoleRedirect to="bookings" />} />
          <Route
            path="reports"
            element={
              <RequireCapability anyOf={['reports.view']}>
                <ClubReportsPage />
              </RequireCapability>
            }
          />
          <Route
            path="payments"
            element={
              <RequireCapability anyOf={['billing.collect']}>
                <ClubPaymentsPage />
              </RequireCapability>
            }
          />
          <Route
            path="club"
            element={
              <RequireCapability anyOf={CLUB_AREA_CAPABILITIES}>
                <ClubHubPage />
              </RequireCapability>
            }
          />
          {CLUB_PAGES.map((p) => {
            const Page = CLUB_PAGE_COMPONENTS[p.id];
            return (
              <Route
                key={p.id}
                path={`club/${p.id}`}
                element={
                  <RequireCapability anyOf={[p.capability]}>
                    <Page />
                  </RequireCapability>
                }
              />
            );
          })}
          <Route path="courts" element={<ConsoleRedirect to="club/courts" />} />
          <Route path="settings" element={<ConsoleRedirect to="club/profile" />} />
          <Route path="*" element={<ConsoleRedirect to="" />} />
        </Routes>
      )}
    </ConsoleLayout>
  );
}

function ConsoleLoading() {
  return (
    <div className="safe-area-top flex h-dvh flex-col bg-background">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mx-auto w-full max-w-3xl p-4">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}

function ClubConsole() {
  const { t } = useTranslation('clubAdmin');
  const { clubId = '' } = useParams<{ clubId: string }>();
  const ctx = useClubConsoleContextQuery(clubId);

  if (ctx.isPending && ctx.fetchStatus === 'paused') {
    // Query paused by the app's network detection: say so instead of an endless skeleton.
    return (
      <div className="safe-area-all flex h-dvh items-center justify-center bg-background">
        <ErrorState kind="offline" onRetry={() => void ctx.refetch()} />
      </div>
    );
  }
  if (ctx.isPending) return <ConsoleLoading />;
  if (ctx.isError) {
    const err = parseClubAdminError(ctx.error);
    const kind = err.status === 403 ? 'forbidden' : err.status === 404 ? 'notFound' : err.network ? 'offline' : 'error';
    return (
      <div className="safe-area-all flex h-dvh items-center justify-center bg-background">
        <ErrorState
          kind={kind}
          onRetry={kind === 'error' || kind === 'offline' ? () => void ctx.refetch() : undefined}
          action={
            kind === 'forbidden' || kind === 'notFound' ? (
              <Link to="/my-clubs" replace className={buttonClass('secondary')}>
                {t('switcher.allClubs')}
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }
  return (
    <ClubConsoleProvider key={clubId} context={ctx.data}>
      <ConsoleRoutes />
    </ClubConsoleProvider>
  );
}

export default function ClubManagementApp() {
  return (
    <Routes>
      <Route index element={<MyClubsPage />} />
      <Route path=":clubId/*" element={<ClubConsole />} />
    </Routes>
  );
}
