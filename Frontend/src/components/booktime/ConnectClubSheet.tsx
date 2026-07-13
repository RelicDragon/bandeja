import { useTranslation } from 'react-i18next';
import type { Club } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { BooktimeConnectForm } from './BooktimeConnectForm';
import { PadelooConnectForm } from './PadelooConnectForm';
import { isBooktimeClub, isPadelooClub } from '@shared/clubIntegration';

export type BooktimeIntegrationConfig = {
  companyId: string;
  termsUrl?: string;
  privacyUrl?: string;
};

type ConnectClubSheetProps = {
  club: Club;
  integrationConfig?: BooktimeIntegrationConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
};

export function ConnectClubSheet({
  club,
  integrationConfig,
  open,
  onOpenChange,
  onConnected,
}: ConnectClubSheetProps) {
  const { t } = useTranslation();
  const providerKey = isPadelooClub(club) ? 'padeloo' : 'booktime';

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} modalId={`${providerKey}-connect-${club.id}`}>
      <DialogContent className="max-w-md max-h-[min(90vh,640px)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isPadelooClub(club)
              ? t('club.padeloo.connectTitle', { club: club.name, defaultValue: `Connect ${club.name}` })
              : t('club.booktime.connectTitle', { club: club.name })}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
          {isPadelooClub(club) ? (
            <PadelooConnectForm
              club={club}
              onConnected={() => {
                onConnected?.();
                onOpenChange(false);
              }}
              variant="dialog"
            />
          ) : isBooktimeClub(club) && integrationConfig ? (
            <BooktimeConnectForm
              club={club}
              integrationConfig={integrationConfig}
              onConnected={() => {
                onConnected?.();
                onOpenChange(false);
              }}
              variant="dialog"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
