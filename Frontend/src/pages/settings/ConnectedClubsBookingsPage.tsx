import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { clubsApi } from '@/api/clubs';
import { SubPageHeader } from '@/components';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { ConnectClubSheet } from '@/components/booktime/ConnectClubSheet';
import { ConnectedClubsBookingsTab } from '@/components/booktime/ConnectedClubsBookingsTab';
import { ConnectedClubsIntegrationsTab } from '@/components/booktime/ConnectedClubsIntegrationsTab';
import { useBooktimeMyClubs } from '@/hooks/useBooktimeMyClubs';
import type { Club } from '@/types';
import { disconnectBooktimeClub } from '@/integrations/booktime/session';
import { handleBack } from '@/utils/backNavigation';

type PageTab = 'bookings' | 'integrations';

function parseConnectedClubsTab(value: string | null): PageTab {
  return value === 'integrations' ? 'integrations' : 'bookings';
}

export function ConnectedClubsBookingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useBackButtonHandler();
  const { data, loading, reload } = useBooktimeMyClubs(true);
  const activeTab = parseConnectedClubsTab(searchParams.get('tab'));
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);
  const [connectClub, setConnectClub] = useState<BooktimeMyClubRow | null>(null);
  const [connectClubEntity, setConnectClubEntity] = useState<Club | null>(null);
  const [disconnectBusyId, setDisconnectBusyId] = useState<string | null>(null);

  const tabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'bookings', label: t('club.booktime.tabBookings') },
      { id: 'integrations', label: t('club.booktime.tabIntegrations') },
    ],
    [t]
  );

  useEffect(() => {
    if (!connectClub) {
      setConnectClubEntity(null);
      return;
    }
    void clubsApi.getById(connectClub.clubId).then((res) => {
      if (res.data) setConnectClubEntity(res.data);
    });
  }, [connectClub]);

  const handleDisconnect = async (clubId: string) => {
    setDisconnectBusyId(clubId);
    try {
      await disconnectBooktimeClub(clubId);
      await reload();
      setBookingsRefreshKey((k) => k + 1);
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
        onBack={() => handleBack(navigate)}
      />

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={tabs}
            activeId={activeTab}
            onChange={(id) => {
              const tab = id as PageTab;
              if (tab === 'bookings') {
                setSearchParams({}, { replace: true });
              } else {
                setSearchParams({ tab }, { replace: true });
              }
            }}
            showOnlyActiveTabText={false}
            layoutId="connectedClubsPageTab"
            ariaLabel={t('club.booktime.connectedClubsPageTitle')}
          />
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : activeTab === 'bookings' ? (
          <ConnectedClubsBookingsTab
            clubs={clubs}
            refreshKey={bookingsRefreshKey}
            onBookingsChanged={() => setBookingsRefreshKey((k) => k + 1)}
          />
        ) : (
          <ConnectedClubsIntegrationsTab
            clubs={clubs}
            disconnectBusyId={disconnectBusyId}
            onConnect={setConnectClub}
            onDisconnect={(clubId) => void handleDisconnect(clubId)}
          />
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
            setBookingsRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
    </div>
  );
}
