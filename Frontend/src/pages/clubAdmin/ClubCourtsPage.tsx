import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clubAdminApi } from '@/api/clubAdmin';
import { ClubAdminLayout } from '@/components/clubAdmin/ClubAdminLayout';
import { ClubAdminCourtForm } from '@/components/clubAdmin/ClubAdminCourtForm';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { Court } from '@/types';

export function ClubCourtsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleForbidden = useClubAdminForbidden();
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const loadCourts = useCallback(() => {
    if (!clubId) return Promise.resolve();
    setLoading(true);
    return clubAdminApi
      .listCourts(clubId)
      .then(setCourts)
      .catch(handleForbidden)
      .finally(() => setLoading(false));
  }, [clubId, handleForbidden]);

  useEffect(() => {
    void loadCourts();
  }, [loadCourts]);

  return (
    <ClubAdminLayout title={t('clubAdmin.allCourts')} backTo={`/my-clubs/${clubId}`}>
      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
      <div className="space-y-2">
        {courts.map((c) => (
          <button
            key={c.id}
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-border p-3 text-left"
            onClick={() => navigate(`/my-clubs/${clubId}/courts/${c.id}`)}
          >
            <span className="font-medium">{c.name}</span>
            <span className="text-xs text-muted-foreground">
              {c.isActive === false ? t('clubAdmin.inactive') : t('clubAdmin.active')}
            </span>
          </button>
        ))}
      </div>
      )}
      <button type="button" className="btn-primary mt-4 w-full" onClick={() => setFormOpen(true)}>
        {t('clubAdmin.addCourt')}
      </button>
      <ClubAdminCourtForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={async (data) => {
          await clubAdminApi.createCourt(clubId!, data);
          await loadCourts();
        }}
      />
    </ClubAdminLayout>
  );
}
