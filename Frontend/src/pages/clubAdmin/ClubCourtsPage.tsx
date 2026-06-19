import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clubAdminApi } from '@/api/clubAdmin';
import { ClubAdminCourtForm } from '@/components/clubAdmin/ClubAdminCourtForm';
import { ClubAdminCourtRow } from '@/components/clubAdmin/ClubAdminCourtRow';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { useClubAdminScreen } from '@/clubAdmin/useClubAdminShell';
import { Court, Sport } from '@/types';

export function ClubCourtsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useTranslation();
  const handleForbidden = useClubAdminForbidden();
  const [courts, setCourts] = useState<Court[]>([]);
  const [clubSports, setClubSports] = useState<Sport[]>(['PADEL']);
  const [loading, setLoading] = useState(true);
  const [formCourt, setFormCourt] = useState<Court | 'new' | null>(null);

  useClubAdminScreen({
    title: t('clubAdmin.allCourts'),
    backTo: `/my-clubs/${clubId}`,
  });

  const loadCourts = useCallback(() => {
    if (!clubId) return Promise.resolve();
    setLoading(true);
    return Promise.all([
      clubAdminApi.listCourts(clubId),
      clubAdminApi.getClub(clubId),
    ])
      .then(([courtList, club]) => {
        setCourts(courtList);
        setClubSports(club.sports?.length ? club.sports : (['PADEL'] as Sport[]));
      })
      .catch(handleForbidden)
      .finally(() => setLoading(false));
  }, [clubId, handleForbidden]);

  useEffect(() => {
    void loadCourts();
  }, [loadCourts]);

  return (
    <>
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      ) : (
        <div className="space-y-2">
          {courts.map((c) => (
            <ClubAdminCourtRow key={c.id} court={c} onEdit={() => setFormCourt(c)} />
          ))}
        </div>
      )}
      <button type="button" className="btn-primary mt-4 w-full" onClick={() => setFormCourt('new')}>
        {t('clubAdmin.addCourt')}
      </button>
      <ClubAdminCourtForm
        open={formCourt !== null}
        court={formCourt === 'new' ? null : formCourt}
        clubSports={clubSports}
        onClose={() => setFormCourt(null)}
        onSubmit={async (data) => {
          if (formCourt === 'new') {
            await clubAdminApi.createCourt(clubId!, data);
          } else if (formCourt) {
            await clubAdminApi.patchCourt(formCourt.id, data);
          }
          await loadCourts();
        }}
      />
    </>
  );
}
