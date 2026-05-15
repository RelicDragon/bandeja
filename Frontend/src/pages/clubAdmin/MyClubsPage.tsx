import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clubAdminApi, ClubAdminClubListItem } from '@/api/clubAdmin';
import { ClubAdminLayout } from '@/components/clubAdmin/ClubAdminLayout';
import { ClubAvatar } from '@/components/ClubAvatar';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { isClubOpenNow } from '@/utils/clubAdmin/openNow';

export function MyClubsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleForbidden = useClubAdminForbidden();
  const [clubs, setClubs] = useState<ClubAdminClubListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    clubAdminApi
      .listClubs()
      .then(setClubs)
      .catch((e) => {
        handleForbidden(e);
      })
      .finally(() => setLoading(false));
  }, [handleForbidden]);

  const filtered =
    query.trim().length > 0 && clubs.length > 5
      ? clubs.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
      : clubs;

  return (
    <ClubAdminLayout title={t('clubAdmin.myClubs')} backTo="/">
      {clubs.length > 5 && (
        <input
          type="search"
          className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder={t('clubAdmin.searchClubs')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const open = isClubOpenNow(c.openingTime, c.closingTime);
            return (
              <button
                key={c.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"
                onClick={() => navigate(`/my-clubs/${c.id}`)}
              >
                <ClubAvatar club={{ id: c.id, name: c.name, avatar: c.avatar }} variant="card" className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.city.name} · {t('clubAdmin.courtsCount', { count: c.courtsCount })}
                    {c.bookingsToday > 0 && ` · ${t('clubAdmin.bookingsToday', { count: c.bookingsToday })}`}
                  </p>
                  {open !== null && (
                    <p className={`text-xs ${open ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {open ? t('clubAdmin.openNow') : t('clubAdmin.closedNow')}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </ClubAdminLayout>
  );
}
