import { useTranslation } from 'react-i18next';
import type { Club } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { BooktimeConnectForm } from './BooktimeConnectForm';

export type BooktimeIntegrationConfig = {
  companyId: string;
  termsUrl?: string;
  privacyUrl?: string;
};

type ConnectClubSheetProps = {
  club: Club;
  integrationConfig: BooktimeIntegrationConfig;
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

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} modalId={`booktime-connect-${club.id}`}>
      <DialogContent className="max-w-md max-h-[min(90vh,640px)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('club.booktime.connectTitle', { club: club.name })}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
          <BooktimeConnectForm
            club={club}
            integrationConfig={integrationConfig}
            onConnected={() => {
              onConnected?.();
              onOpenChange(false);
            }}
            variant="dialog"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
