import React, { ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bug as BugIcon, Loader2, WifiOff } from 'lucide-react';
import { ChatHeaderActions } from '@/components/chat/ChatHeaderActions';
import type { ChatContextType } from '@/api/chat';
import type { Game } from '@/types';
import { useChatOfflineStore } from '@/store/chatOfflineStore';
import { useChatSyncStore } from '@/store/chatSyncStore';

export interface GameChatHeaderActionsProps {
  showMute: boolean;
  showLeave: boolean;
  showParticipantsButton: boolean;
  isMuted: boolean;
  isTogglingMute: boolean;
  onToggleMute: () => void;
  onLeaveClick: () => void;
  leaveTitle: string;
  game: Game | null;
  onParticipantsClick: () => void;
}

export interface GameChatHeaderProps {
  isEmbedded: boolean;
  showLoadingHeader: boolean;
  contextType: ChatContextType;
  isBugChat: boolean;
  title: string;
  titleContent?: React.ReactNode;
  titleMetaRow?: React.ReactNode;
  subtitle: string | null;
  icon: ReactNode;
  onBack: () => void;
  showPanelBack: boolean;
  onPanelBack: () => void;
  isTitleClickable: boolean;
  onTitleClick?: () => void;
  showHeaderActions: boolean;
  headerActions: GameChatHeaderActionsProps | null;
}

export const GameChatHeader: React.FC<GameChatHeaderProps> = ({
  isEmbedded,
  showLoadingHeader,
  contextType,
  isBugChat,
  title,
  titleContent,
  titleMetaRow,
  subtitle,
  icon,
  onBack,
  showPanelBack,
  onPanelBack,
  isTitleClickable,
  onTitleClick,
  showHeaderActions,
  headerActions,
}) => {
  const { t } = useTranslation();
  const isStructuredTitle = titleContent != null;
  const chatConnectionState = useChatOfflineStore((s) => s.chatConnectionState);
  const paint = useChatSyncStore((s) => s.lastThreadPaintSource);
  const paintHint = useMemo(
    () =>
      paint === 'dexie'
        ? t('chat.statusPaintDexie', 'Opened from saved messages')
        : paint === 'network'
          ? t('chat.statusPaintNetwork', 'Loaded from server')
          : undefined,
    [paint, t]
  );
  const statusTitle =
    chatConnectionState === 'OFFLINE'
      ? t('chat.offlineBanner', 'No connection — showing saved messages')
      : chatConnectionState === 'SYNCING'
        ? t('chat.syncingBanner', 'Syncing…')
        : undefined;
  const headerStatusSlot =
    chatConnectionState === 'OFFLINE' ? (
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
        role="status"
        title={paintHint ?? statusTitle}
        aria-label={statusTitle}
      >
        <WifiOff size={22} strokeWidth={2} />
      </div>
    ) : chatConnectionState === 'SYNCING' ? (
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        role="status"
        title={paintHint ?? statusTitle}
        aria-label={statusTitle}
      >
        <Loader2 size={22} className="animate-spin" strokeWidth={2} />
      </div>
    ) : null;

  const backRowSpan =
    subtitle != null ? 4 : titleMetaRow != null ? 3 : 2;

  return (
    <header
      className="z-40 flex-shrink-0 border-b border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900"
      style={{ paddingTop: isEmbedded ? '0' : 'env(safe-area-inset-top)' }}
    >
      <div
        className={`mx-auto max-w-2xl px-4 ${
          isStructuredTitle ? 'w-full py-2.5' : 'flex items-center justify-between gap-2 py-3'
        }`}
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {showLoadingHeader ? (
          <div className="flex w-full items-center gap-3">
            {headerStatusSlot ?? <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />}
            <div className="flex-1">
              <div className="mb-1 h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-48 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ) : isStructuredTitle ? (
          <div
            className={`grid w-full min-w-0 gap-x-2 gap-y-0.5 ${
              !isEmbedded ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
            }`}
          >
            {!isEmbedded && (
              <button
                onClick={onBack}
                className="col-start-1 row-start-1 self-center rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                style={{ gridRowEnd: `span ${backRowSpan}` }}
              >
                <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
            )}
            {showPanelBack && (
              <div className="col-start-1 row-start-1 hidden self-center md:block">
                <button
                  onClick={onPanelBack}
                  className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                </button>
              </div>
            )}
            <div
              className={`min-w-0 ${!isEmbedded ? 'col-start-2' : 'col-start-1'} row-start-1 ${
                isTitleClickable ? 'cursor-pointer rounded-lg' : ''
              }`}
              onClick={isTitleClickable ? onTitleClick : undefined}
              onKeyDown={
                isTitleClickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTitleClick?.();
                      }
                    }
                  : undefined
              }
              role={isTitleClickable ? 'button' : undefined}
              tabIndex={isTitleClickable ? 0 : undefined}
            >
              <h1 className="min-w-0" aria-label={title}>
                {titleContent}
              </h1>
            </div>
            {showHeaderActions && headerActions != null && (
              <div
                className={`row-start-1 row-span-2 self-start ${!isEmbedded ? 'col-start-3' : 'col-start-2'}`}
              >
                <ChatHeaderActions
                  showMute={headerActions.showMute}
                  showLeave={headerActions.showLeave}
                  showParticipantsButton={headerActions.showParticipantsButton}
                  isMuted={headerActions.isMuted}
                  isTogglingMute={headerActions.isTogglingMute}
                  onToggleMute={headerActions.onToggleMute}
                  onLeaveClick={headerActions.onLeaveClick}
                  leaveTitle={headerActions.leaveTitle}
                  game={headerActions.game}
                  onParticipantsClick={headerActions.onParticipantsClick}
                />
              </div>
            )}
            {titleMetaRow != null && (
              <div
                className={`min-w-0 ${!isEmbedded ? 'col-start-2 col-span-2' : 'col-span-2'} row-start-3 ${
                  isTitleClickable ? 'cursor-pointer' : ''
                }`}
                onClick={isTitleClickable ? onTitleClick : undefined}
                role={isTitleClickable ? 'presentation' : undefined}
              >
                {titleMetaRow}
              </div>
            )}
            {subtitle != null && (
              <p
                className={`truncate text-[11px] tabular-nums text-gray-500 dark:text-gray-400 ${
                  !isEmbedded ? 'col-start-2 col-span-2' : 'col-span-2'
                } ${titleMetaRow != null ? 'row-start-4' : 'row-start-3'} ${
                  isTitleClickable ? 'cursor-pointer' : ''
                }`}
                onClick={isTitleClickable ? onTitleClick : undefined}
                role={isTitleClickable ? 'presentation' : undefined}
              >
                {subtitle}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {!isEmbedded && (
                <button
                  onClick={onBack}
                  className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                </button>
              )}
              {showPanelBack && (
                <div className="hidden w-auto opacity-100 transition-all duration-300 ease-in-out md:block">
                  <button
                    onClick={onPanelBack}
                    className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
                  </button>
                </div>
              )}
              <div
                className={`flex min-w-0 flex-1 items-center gap-2 ${isTitleClickable ? 'cursor-pointer' : ''}`}
                onClick={isTitleClickable ? onTitleClick : undefined}
                role={isTitleClickable ? 'button' : undefined}
              >
                {!isBugChat && <div className="flex-shrink-0">{headerStatusSlot ?? icon}</div>}
                <div className="min-w-0 flex-1">
                  <h1
                    className={`${isBugChat ? 'text-base' : 'text-lg'} flex min-w-0 items-center gap-2 font-semibold text-gray-900 dark:text-white`}
                  >
                    {isBugChat && headerStatusSlot}
                    {isBugChat && (
                      <BugIcon size={16} className="flex-shrink-0 text-red-500" />
                    )}
                    <span
                      className={`truncate ${
                        isTitleClickable && (contextType === 'GROUP' || contextType === 'GAME')
                          ? 'transition-colors hover:text-primary-600 dark:hover:text-primary-400'
                          : ''
                      }`}
                    >
                      {title}
                    </span>
                  </h1>
                  {subtitle != null && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
                  )}
                </div>
              </div>
            </div>
            {showHeaderActions && headerActions != null && (
              <ChatHeaderActions
                showMute={headerActions.showMute}
                showLeave={headerActions.showLeave}
                showParticipantsButton={headerActions.showParticipantsButton}
                isMuted={headerActions.isMuted}
                isTogglingMute={headerActions.isTogglingMute}
                onToggleMute={headerActions.onToggleMute}
                onLeaveClick={headerActions.onLeaveClick}
                leaveTitle={headerActions.leaveTitle}
                game={headerActions.game}
                onParticipantsClick={headerActions.onParticipantsClick}
              />
            )}
          </>
        )}
      </div>
    </header>
  );
};
