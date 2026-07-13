import { useTranslation } from 'react-i18next';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { Card } from '@/components';
import { ConnectedClubCard } from './ConnectedClubCard';

type Props = {
  clubs: ConnectedBookingClubRow[];
  disconnectBusyId: string | null;
  onConnect: (club: ConnectedBookingClubRow) => void;
  onDisconnect: (clubId: string) => void;
};

export function ConnectedClubsIntegrationsTab({
  clubs,
  disconnectBusyId,
  onConnect,
  onDisconnect,
}: Props) {
  const { t } = useTranslation();

  if (clubs.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
        {t('club.booktime.noBooktimeClubsInCity')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('club.booktime.connectedClubsCardHint')}</p>
      </Card>
      <ul className="space-y-4">
        {clubs.map((club) => (
          <li key={club.clubId}>
            <ConnectedClubCard
              club={club}
              disconnectBusy={disconnectBusyId === club.clubId}
              onConnect={() => onConnect(club)}
              onDisconnect={() => onDisconnect(club.clubId)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
