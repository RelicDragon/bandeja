import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { AlertTriangle, CalendarDays, ClipboardList, Eye, LayoutGrid, Loader2, Settings } from 'lucide-react';
import { clubAdminApi } from '@/api/clubAdmin';
import { ClubAdminCoachMark } from '@/components/clubAdmin/ClubAdminCoachMark';
import { ClubAdminActionCard } from '@/components/clubAdmin/ClubAdminActionCard';
import { ClubAdminHomeHero } from '@/components/clubAdmin/ClubAdminHomeHero';
import { ClubAdminTodayStats } from '@/components/clubAdmin/ClubAdminTodayStats';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { ClubViewAsPlayerModal } from '@/components/clubAdmin/ClubViewAsPlayerModal';
import { useClubAdminScreen } from '@/clubAdmin/useClubAdminShell';
import {
  markClubAdminCoachStep,
  readClubAdminCoachMarks,
} from '@/utils/clubAdminCoachMarksStorage';

export function ClubAdminHomePage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleForbidden = useClubAdminForbidden();
  const [club, setClub] = useState<Awaited<ReturnType<typeof clubAdminApi.getClub>> | null>(null);
  const [todaySummary, setTodaySummary] = useState<{
    slots: number;
    conflicts: number;
    externalSlotsFailed: boolean;
  } | null>(null);
  const [viewAsPlayerOpen, setViewAsPlayerOpen] = useState(false);
  const [coachMarks, setCoachMarks] = useState(readClubAdminCoachMarks);
  const [loading, setLoading] = useState(true);

  useClubAdminScreen({
    title: club?.name ?? t('clubAdmin.myClubs'),
    backTo: '/my-clubs',
  });

  useEffect(() => {
    if (!clubId) return;
    setLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    clubAdminApi
      .getClub(clubId)
      .then(setClub)
      .catch((e) => {
        if (!handleForbidden(e)) navigate('/my-clubs');
      })
      .finally(() => setLoading(false));
    clubAdminApi
      .getSchedule(clubId, today)
      .then((s) =>
        setTodaySummary({
          slots: s.slots.length,
          conflicts: s.conflicts.length,
          externalSlotsFailed: !!s.externalSlotsFailed,
        })
      )
      .catch(() => setTodaySummary(null));
  }, [clubId, navigate, handleForbidden]);

  if (!clubId) return null;

  if (loading || !club) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-lg space-y-5 pb-4">
        <ClubAdminHomeHero club={club} />

        {todaySummary && (
          <ClubAdminTodayStats slots={todaySummary.slots} conflicts={todaySummary.conflicts} />
        )}

        {todaySummary?.externalSlotsFailed && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-300">{t('clubAdmin.integrationDown')}</p>
          </div>
        )}

        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('clubAdmin.quickActions')}
          </p>
          <ClubAdminCoachMark
            show={!coachMarks.schedule}
            stepLabel={t('clubAdmin.coachStep', { current: 1, total: 3 })}
            message={t('clubAdmin.coachSchedule')}
            onDismiss={() => {
              markClubAdminCoachStep('schedule');
              setCoachMarks(readClubAdminCoachMarks());
            }}
          >
            <ClubAdminActionCard
              icon={CalendarDays}
              label={t('clubAdmin.todaysSchedule')}
              onClick={() => navigate(`schedule`)}
            />
          </ClubAdminCoachMark>
          <ClubAdminActionCard
            icon={ClipboardList}
            label={t('clubAdmin.reservations')}
            onClick={() => navigate(`reservations`)}
          />
          <ClubAdminActionCard
            icon={LayoutGrid}
            label={t('clubAdmin.allCourts')}
            onClick={() => navigate(`courts`)}
          />
          <ClubAdminCoachMark
            show={coachMarks.schedule && coachMarks.tapSlot && !coachMarks.settings}
            stepLabel={t('clubAdmin.coachStep', { current: 3, total: 3 })}
            message={t('clubAdmin.coachSettings')}
            onDismiss={() => {
              markClubAdminCoachStep('settings');
              setCoachMarks(readClubAdminCoachMarks());
            }}
          >
            <ClubAdminActionCard
              icon={Settings}
              label={t('clubAdmin.settings')}
              onClick={() => navigate(`settings`)}
            />
          </ClubAdminCoachMark>
        </div>

        <div className="flex items-center justify-center pt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            onClick={() => setViewAsPlayerOpen(true)}
          >
            <Eye className="h-3.5 w-3.5" />
            {t('clubAdmin.viewAsPlayer')}
          </button>
        </div>
      </div>

      <ClubViewAsPlayerModal clubId={clubId} open={viewAsPlayerOpen} onClose={() => setViewAsPlayerOpen(false)} />
    </>
  );
}
