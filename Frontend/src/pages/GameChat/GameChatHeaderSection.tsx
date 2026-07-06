import React, { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { ChatConnectionActivityOverlay } from './ChatConnectionActivityOverlay';
import { GameChatHeader } from './GameChatHeader';
import { GameChatStatusBanner } from './GameChatHeaderMotion';
import { GameChatLoadingLine } from './GameChatLoadingLine';
import { useThreadChrome } from './useThreadView';

/** Header chrome — subscribes only to ThreadChromeContext, not message/scroll seams. */
export const GameChatHeaderSection: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isNetworkOnline = useNetworkStore((s) => s.isOnline);
  const chrome = useThreadChrome();
  const {
    id,
    contextType,
    isEmbedded,
    game,
    derived,
    title,
    titleContent,
    titleMetaRow,
    subtitle,
    icon,
    panels,
    failedMutationCount,
    retryMutations,
    handleToggleMute,
    isMuted,
    isTogglingMute,
    handleLeaveClick,
    showLoadingHeader,
    navigate,
  } = chrome;

  const routeGameId = useMemo(() => {
    const m = location.pathname.match(/^\/games\/([^/]+)/);
    return m?.[1];
  }, [location.pathname]);

  const isGameDetailsSideChat = useMemo(
    () =>
      isEmbedded &&
      contextType === 'GAME' &&
      !!id &&
      routeGameId === id &&
      !location.pathname.includes('/chat'),
    [isEmbedded, contextType, id, routeGameId, location.pathname]
  );

  const isGameTitleNavToGame = useMemo(
    () => contextType === 'GAME' && !!id && !isGameDetailsSideChat,
    [contextType, id, isGameDetailsSideChat]
  );

  const isTitleClickable = useMemo(
    () =>
      !!(contextType === 'USER' && chrome.userChat && user?.id) ||
      contextType === 'GROUP' ||
      isGameTitleNavToGame,
    [contextType, chrome.userChat, user?.id, isGameTitleNavToGame]
  );

  const handleTitleClick = useCallback(() => {
    if (isGameTitleNavToGame && id) {
      navigate(`/games/${id}`);
      return;
    }
    panels.handleTitleClick();
  }, [isGameTitleNavToGame, id, navigate, panels]);

  const headerActions = useMemo(
    () =>
      derived.showHeaderActions
        ? {
            showMute: derived.showMute,
            showLeave: derived.showLeave,
            showParticipantsButton: contextType === 'GAME',
            isMuted,
            isTogglingMute,
            onToggleMute: handleToggleMute,
            onLeaveClick: handleLeaveClick,
            leaveTitle: derived.leaveTitle,
            game,
            onParticipantsClick: () => panels.setShowParticipantsModal(true),
          }
        : null,
    [
      derived.showHeaderActions,
      derived.showMute,
      derived.showLeave,
      derived.leaveTitle,
      contextType,
      isMuted,
      isTogglingMute,
      handleToggleMute,
      handleLeaveClick,
      game,
      panels,
    ]
  );

  return (
    <>
      <div className="relative">
        <GameChatHeader
          isEmbedded={isEmbedded}
          contextType={contextType}
          isBugChat={derived.isBugChat}
          title={title}
          titleContent={titleContent}
          titleMetaRow={titleMetaRow}
          subtitle={subtitle}
          icon={icon}
          onBack={panels.handleHeaderBack}
          showPanelBack={
            contextType === 'GROUP' &&
            (panels.showParticipantsPage ||
              panels.showItemPage ||
              panels.isParticipantsPageAnimating ||
              panels.isItemPageAnimating)
          }
          onPanelBack={panels.handlePanelBack}
          isTitleClickable={isTitleClickable}
          onTitleClick={handleTitleClick}
          showHeaderActions={derived.showHeaderActions}
          headerActions={headerActions}
        />
        <ChatConnectionActivityOverlay />
        <GameChatLoadingLine show={showLoadingHeader} />
      </div>

      <GameChatStatusBanner
        show={!showLoadingHeader && failedMutationCount > 0}
        className="overflow-hidden"
      >
        {isNetworkOnline ? (
          <button
            type="button"
            onClick={() => retryMutations()}
            className="flex w-full items-center justify-center gap-1.5 border-b border-amber-200 bg-amber-100 px-3 py-2 text-center text-sm text-amber-900 transition-colors hover:bg-amber-200/70 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            <RefreshCw size={14} aria-hidden />
            {t('chat.mutationsSyncFailed', { defaultValue: 'Some actions did not sync. Tap to retry.' })}
          </button>
        ) : (
          <div
            role="status"
            className="flex w-full items-center justify-center gap-1.5 border-b border-gray-200 bg-gray-100 px-3 py-2 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <CloudOff size={14} aria-hidden />
            {t('chat.queuedWhileOffline', { defaultValue: 'Queued — will sync when you’re back online' })}
          </div>
        )}
      </GameChatStatusBanner>
    </>
  );
};
