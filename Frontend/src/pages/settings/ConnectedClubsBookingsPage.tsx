import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { clubsApi } from '@/api/clubs';
import { SubPageHeader } from '@/components';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { ConnectClubSheet, type BooktimeIntegrationConfig } from '@/components/booktime/ConnectClubSheet';
import { ConnectedClubsBookingsTab } from '@/components/booktime/ConnectedClubsBookingsTab';
import { ConnectedClubsIntegrationsTab } from '@/components/booktime/ConnectedClubsIntegrationsTab';
import { useConnectedBookingClubs } from '@/hooks/useConnectedBookingClubs';
import type { Club } from '@/types';
import { disconnectBooktimeClub } from '@/integrations/booktime/session';
import { disconnectKlikterenClub } from '@/integrations/klikteren/session';
import { disconnectPadelooClub } from '@/integrations/padeloo/session';
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
  const { data, loading, reload } = useConnectedBookingClubs(true);
  const activeTab = parseConnectedClubsTab(searchParams.get('tab'));
  const [bookingsRefreshKey, setBookingsRefreshKey] = useState(0);
  const [connectClub, setConnectClub] = useState<ConnectedBookingClubRow | null>(null);
  const [connectClubEntity, setConnectClubEntity] = useState<Club | null>(null);
  const [disconnectBusyId, setDisconnectBusyId] = useState<string | null>(null);

  const tabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'bookings', label: t('club.booktime.tabBookings') },
      { id: 'integrations', label: t('club.booktime.tabIntegrations') },
    ],
    [t],
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

  const handleDisconnect = async (club: ConnectedBookingClubRow) => {
    setDisconnectBusyId(club.clubId);
    try {
      if (club.integrationType === 'PADELOO') {
        await disconnectPadelooClub(club.clubId);
      } else if (club.integrationType === 'KLIKTEREN') {
        await disconnectKlikterenClub(club.clubId);
      } else {
        await disconnectBooktimeClub(club.clubId);
      }
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

  const integrationConfig: BooktimeIntegrationConfig | undefined =
    connectClub?.companyId
      ? {
          companyId: connectClub.companyId,
          termsUrl: connectClubEntity?.integrationConfig?.termsUrl,
          privacyUrl: connectClubEntity?.integrationConfig?.privacyUrl,
        }
      : undefined;

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
          <ConnectedClubsBookingsTab clubs={clubs} refreshKey={bookingsRefreshKey} />
        ) : (
          <ConnectedClubsIntegrationsTab
            clubs={clubs}
            disconnectBusyId={disconnectBusyId}
            onConnect={setConnectClub}
            onDisconnect={(clubId) => {
              const club = clubs.find((row) => row.clubId === clubId);
              if (club) void handleDisconnect(club);
            }}
          />
        )}
      </div>

      {connectClub && connectClubEntity ? (
        <ConnectClubSheet
          club={connectClubEntity}
          integrationConfig={integrationConfig}
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
