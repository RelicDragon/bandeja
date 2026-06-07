import React, { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { GameChatHeader } from './GameChatHeader';
import { useThreadChrome } from './useThreadView';

/** Header chrome — subscribes only to ThreadChromeContext, not message/scroll seams. */
export const GameChatHeaderSection: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuthStore();
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
    setShowLeaveConfirmation,
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
            onLeaveClick: () => setShowLeaveConfirmation(true),
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
      setShowLeaveConfirmation,
      game,
      panels,
    ]
  );

  return (
    <>
      <GameChatHeader
        isEmbedded={isEmbedded}
        showLoadingHeader={showLoadingHeader}
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

      {!showLoadingHeader && failedMutationCount > 0 && (
        <button
          type="button"
          onClick={() => retryMutations()}
          className="w-full text-center text-sm py-2 px-3 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-b border-amber-200 dark:border-amber-800"
        >
          {t('chat.mutationsSyncFailed', { defaultValue: 'Some actions did not sync. Tap to retry.' })}
        </button>
      )}
    </>
  );
};
