import { MessageCircle, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CourtLobbyActionButton } from '@/components/playIntent/CourtLobbyActionButton';

export function CourtLobbyActions({
  hasProposal,
  showWaiting,
  canDiscuss,
  actionsLocked,
  busy,
  discussing,
  rosterFull,
  waitingDates,
  onCreate,
  onConfirm,
  onDismiss,
  onDiscuss,
}: {
  hasProposal: boolean;
  showWaiting: boolean;
  canDiscuss: boolean;
  actionsLocked: boolean;
  busy: boolean;
  discussing: boolean;
  rosterFull: boolean;
  waitingDates: string;
  onCreate: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onDiscuss: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex flex-col gap-2">
      {!hasProposal ? (
        <CourtLobbyActionButton
          className="w-full"
          icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />}
          onClick={onCreate}
          disabled={actionsLocked}
        >
          {t('playIntent.createGame')}
        </CourtLobbyActionButton>
      ) : showWaiting ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-black/[0.035] px-3.5 py-2.5 dark:bg-white/[0.06]">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {t('playIntent.waitingHost')}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {waitingDates}
            </p>
          </div>
          <CourtLobbyActionButton
            tone="ghost"
            className="h-10 shrink-0 px-3.5 text-sm"
            onClick={onDismiss}
            disabled={actionsLocked}
          >
            {t('playIntent.decline')}
          </CourtLobbyActionButton>
        </div>
      ) : (
        <div className="flex gap-2">
          <CourtLobbyActionButton
            tone="ghost"
            className="h-12 shrink-0 px-4"
            onClick={onDismiss}
            disabled={actionsLocked}
          >
            {t('playIntent.decline')}
          </CourtLobbyActionButton>
          <CourtLobbyActionButton
            className="min-w-0 flex-1"
            loading={busy}
            icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />}
            onClick={onConfirm}
            disabled={actionsLocked || !rosterFull}
          >
            {t('playIntent.createGame')}
          </CourtLobbyActionButton>
        </div>
      )}
      {canDiscuss && (
        <CourtLobbyActionButton
          tone="secondary"
          className="w-full"
          data-testid="lobby-discuss"
          loading={discussing}
          icon={<MessageCircle className="h-3.5 w-3.5" strokeWidth={2.2} />}
          onClick={onDiscuss}
          disabled={actionsLocked}
        >
          {t('playIntent.discussInGroup')}
        </CourtLobbyActionButton>
      )}
    </div>
  );
}
