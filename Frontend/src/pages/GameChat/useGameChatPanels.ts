import { useState, useCallback, useMemo } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { CHAT_PANE_SLIDE_MS } from '@/components/chat/chatListMotion';
import { handleBack } from '@/utils/backNavigation';
import type { ChatContextType } from '@/api/chat';

export interface UseGameChatPanelsParams {
  contextType: ChatContextType;
  userChat: { user1Id: string; user2Id: string } | null;
  userId: string | undefined;
  isItemChat: boolean;
  navigate: NavigateFunction;
}

export function useGameChatPanels({
  contextType,
  userChat,
  userId,
  isItemChat,
  navigate,
}: UseGameChatPanelsParams) {
  const [showParticipantsPage, setShowParticipantsPage] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [isParticipantsPageAnimating, setIsParticipantsPageAnimating] = useState(false);
  const [showItemPage, setShowItemPage] = useState(false);
  const [isItemPageAnimating, setIsItemPageAnimating] = useState(false);
  const [showPlayerCard, setShowPlayerCard] = useState(false);

  const closeItemPage = useCallback(() => {
    setIsItemPageAnimating(true);
    setTimeout(() => setShowItemPage(false), CHAT_PANE_SLIDE_MS);
  }, []);
  const closeParticipantsPage = useCallback(() => {
    setIsParticipantsPageAnimating(true);
    setTimeout(() => setShowParticipantsPage(false), CHAT_PANE_SLIDE_MS);
  }, []);

  const onOpenItemPage = useCallback(() => {
    setShowItemPage(true);
    setIsItemPageAnimating(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsItemPageAnimating(false)));
  }, []);
  const onOpenParticipantsPage = useCallback(() => {
    setShowParticipantsPage(true);
    setIsParticipantsPageAnimating(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setIsParticipantsPageAnimating(false)));
  }, []);

  const handleHeaderBack = useCallback(() => {
    if (showItemPage) {
      closeItemPage();
      return;
    }
    if (showParticipantsPage) {
      closeParticipantsPage();
      return;
    }
    if (contextType === 'GAME' && showParticipantsModal) {
      setShowParticipantsModal(false);
      return;
    }
    handleBack(navigate);
  }, [
    navigate,
    contextType,
    showItemPage,
    showParticipantsPage,
    showParticipantsModal,
    closeItemPage,
    closeParticipantsPage,
  ]);

  const handlePanelBack = useCallback(() => {
    if (showItemPage) closeItemPage();
    else closeParticipantsPage();
  }, [showItemPage, closeItemPage, closeParticipantsPage]);

  const handleTitleClick = useCallback(() => {
    if (contextType === 'USER' && userChat && userId) {
      setShowPlayerCard(true);
      return;
    }
    if (contextType === 'GROUP') {
      if (isItemChat) onOpenItemPage();
      else onOpenParticipantsPage();
    }
  }, [contextType, userChat, userId, isItemChat, onOpenItemPage, onOpenParticipantsPage]);

  const handleBackButton = useCallback(() => {
    if (showItemPage) {
      closeItemPage();
      return true;
    }
    if (showParticipantsPage) {
      closeParticipantsPage();
      return true;
    }
    if (contextType === 'GAME' && showParticipantsModal) {
      setShowParticipantsModal(false);
      return true;
    }
    handleBack(navigate);
    return true;
  }, [
    navigate,
    contextType,
    showItemPage,
    showParticipantsPage,
    showParticipantsModal,
    closeItemPage,
    closeParticipantsPage,
  ]);

  return useMemo(
    () => ({
      showParticipantsPage,
      setShowParticipantsPage,
      showParticipantsModal,
      setShowParticipantsModal,
      isParticipantsPageAnimating,
      setIsParticipantsPageAnimating,
      showItemPage,
      setShowItemPage,
      isItemPageAnimating,
      setIsItemPageAnimating,
      showPlayerCard,
      setShowPlayerCard,
      onOpenItemPage,
      onOpenParticipantsPage,
      handleHeaderBack,
      handlePanelBack,
      handleTitleClick,
      handleBackButton,
      closeItemPage,
      closeParticipantsPage,
    }),
    [
      showParticipantsPage,
      showParticipantsModal,
      isParticipantsPageAnimating,
      showItemPage,
      isItemPageAnimating,
      showPlayerCard,
      onOpenItemPage,
      onOpenParticipantsPage,
      handleHeaderBack,
      handlePanelBack,
      handleTitleClick,
      handleBackButton,
      closeItemPage,
      closeParticipantsPage,
    ],
  );
}
