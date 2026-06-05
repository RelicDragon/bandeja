import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { clubAdminApi } from '@/api/clubAdmin';
import { ClubAdminLayout } from '@/components/clubAdmin/ClubAdminLayout';
import { ClubAdminCoachMark } from '@/components/clubAdmin/ClubAdminCoachMark';
import { ClubAvatar } from '@/components/ClubAvatar';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { ClubViewAsPlayerModal } from '@/components/clubAdmin/ClubViewAsPlayerModal';
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
      <ClubAdminLayout title={t('clubAdmin.myClubs')} backTo="/my-clubs">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </ClubAdminLayout>
    );
  }

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <ClubAdminLayout title={club.name} backTo="/my-clubs">
      <div className="mb-4 flex items-center gap-3">
        <ClubAvatar club={club} variant="card" className="h-14 w-14" />
        <div>
          <p className="text-sm text-muted-foreground">{club.city?.name}</p>
          {club.integrationActive ? (
            <p className="text-xs text-amber-600">{t('clubAdmin.integrationLinked')}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('clubAdmin.integrationNone')}</p>
          )}
        </div>
      </div>

      {todaySummary && (
        <p className="mb-3 text-sm text-muted-foreground">
          {t('clubAdmin.todaySummary', {
            slots: todaySummary.slots,
            conflicts: todaySummary.conflicts,
          })}
        </p>
      )}
      {todaySummary && todaySummary.conflicts > 0 && (
        <p className="mb-3 text-xs text-amber-600">{t('clubAdmin.conflicts', { count: todaySummary.conflicts })}</p>
      )}
      {todaySummary?.externalSlotsFailed && (
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {t('clubAdmin.integrationDown')}
        </p>
      )}

      <div className="grid gap-2">
        <ClubAdminCoachMark
          show={!coachMarks.schedule}
          stepLabel={t('clubAdmin.coachStep', { current: 1, total: 3 })}
          message={t('clubAdmin.coachSchedule')}
          onDismiss={() => {
            markClubAdminCoachStep('schedule');
            setCoachMarks(readClubAdminCoachMarks());
          }}
        >
          <button type="button" className="btn-primary w-full" onClick={() => navigate(`/my-clubs/${clubId}/schedule`)}>
            {t('clubAdmin.todaysSchedule')}
          </button>
        </ClubAdminCoachMark>
        <button type="button" className="btn-secondary w-full" onClick={() => navigate(`/my-clubs/${clubId}/courts`)}>
          {t('clubAdmin.allCourts')}
        </button>
        <ClubAdminCoachMark
          show={coachMarks.schedule && coachMarks.tapSlot && !coachMarks.settings}
          stepLabel={t('clubAdmin.coachStep', { current: 3, total: 3 })}
          message={t('clubAdmin.coachSettings')}
          onDismiss={() => {
            markClubAdminCoachStep('settings');
            setCoachMarks(readClubAdminCoachMarks());
          }}
        >
          <button type="button" className="btn-secondary w-full" onClick={() => navigate(`/my-clubs/${clubId}/settings`)}>
            {t('clubAdmin.settings')}
          </button>
        </ClubAdminCoachMark>
        <button type="button" className="text-sm text-muted-foreground underline" onClick={() => navigate(`/my-clubs/${clubId}/schedule?date=${today}`)}>
          {t('clubAdmin.viewToday')}
        </button>
        <button type="button" className="text-sm text-primary underline" onClick={() => setViewAsPlayerOpen(true)}>
          {t('clubAdmin.viewAsPlayer')}
        </button>
      </div>
      <ClubViewAsPlayerModal clubId={clubId} open={viewAsPlayerOpen} onClose={() => setViewAsPlayerOpen(false)} />
    </ClubAdminLayout>
  );
}
