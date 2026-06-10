import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { booktimeApi, type BooktimeMyClubRow } from '@/api/booktime';
import { clubsApi } from '@/api/clubs';
import { Card, SubPageHeader } from '@/components';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { ConnectClubSheet } from '@/components/booktime/ConnectClubSheet';
import { ConnectedClubCard } from '@/components/booktime/ConnectedClubCard';
import { useBooktimeMyClubs } from '@/hooks/useBooktimeMyClubs';
import type { Club } from '@/types';
import { disconnectBooktimeClub } from '@/integrations/booktime/session';

export function ConnectedClubsBookingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useBackButtonHandler(() => {
    navigate('/profile');
    return true;
  });
  const { data, loading, reload } = useBooktimeMyClubs(true);
  const [connectClub, setConnectClub] = useState<BooktimeMyClubRow | null>(null);
  const [connectClubEntity, setConnectClubEntity] = useState<Club | null>(null);
  const [scoutBusyId, setScoutBusyId] = useState<string | null>(null);
  const [disconnectBusyId, setDisconnectBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!connectClub) {
      setConnectClubEntity(null);
      return;
    }
    void clubsApi.getById(connectClub.clubId).then((res) => {
      if (res.data) setConnectClubEntity(res.data);
    });
  }, [connectClub]);

  const handleScoutToggle = async (club: BooktimeMyClubRow, next: boolean) => {
    setScoutBusyId(club.clubId);
    try {
      await booktimeApi.patchScoutOptIn(club.clubId, next);
      await reload();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setScoutBusyId(null);
    }
  };

  const handleDisconnect = async (clubId: string) => {
    setDisconnectBusyId(clubId);
    try {
      await disconnectBooktimeClub(clubId);
      await reload();
      toast.success(t('club.booktime.disconnected'));
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setDisconnectBusyId(null);
    }
  };

  const clubs = data?.clubs ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-safe">
      <SubPageHeader
        title={t('club.booktime.connectedClubsPageTitle')}
        onBack={() => navigate('/profile')}
      />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <Card className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('club.booktime.connectedClubsCardHint')}</p>
        </Card>

        {loading && !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : clubs.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
            {t('club.booktime.noBooktimeClubsInCity')}
          </p>
        ) : (
          <ul className="space-y-4">
            {clubs.map((club) => (
              <li key={club.clubId}>
                <ConnectedClubCard
                  club={club}
                  disconnectBusy={disconnectBusyId === club.clubId}
                  scoutBusy={scoutBusyId === club.clubId}
                  onConnect={() => setConnectClub(club)}
                  onDisconnect={() => void handleDisconnect(club.clubId)}
                  onScoutToggle={(next) => void handleScoutToggle(club, next)}
                  onBookingsChanged={() => void reload()}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {connectClub && connectClubEntity && connectClub.companyId ? (
        <ConnectClubSheet
          club={connectClubEntity}
          integrationConfig={{
            companyId: connectClub.companyId,
            termsUrl: connectClubEntity.integrationConfig?.termsUrl,
            privacyUrl: connectClubEntity.integrationConfig?.privacyUrl,
          }}
          open={!!connectClub}
          onOpenChange={(open) => !open && setConnectClub(null)}
          onConnected={() => {
            setConnectClub(null);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}
