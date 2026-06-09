import React from 'react';
import { GameChatFooter } from './GameChatFooter';
import { useThreadChrome } from './useThreadView';

/** Footer visibility gate — chrome seam only. */
export const GameChatFooterGate: React.FC = () => {
  const { contextType, effectiveFooterVariant, panels } = useThreadChrome();

  const panelOverlayActive =
    contextType === 'GROUP' &&
    (panels.showParticipantsPage ||
      panels.showItemPage ||
      panels.isParticipantsPageAnimating ||
      panels.isItemPageAnimating);

  if (effectiveFooterVariant == null || panelOverlayActive) return null;

  return <GameChatFooter visible variant={effectiveFooterVariant} />;
};
