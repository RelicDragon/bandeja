import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { PublicGamePrompt } from '@/components/GameDetails/PublicGamePrompt';
import { useAuthStore } from '@/store/authStore';

/** One on-demand prompt owned by PlayerCardModalManager, outside avatar lists. */
export function PlayerAuthPromptDialog({ onClose, returnFocusTo }: {
  onClose: () => void;
  returnFocusTo: HTMLElement;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const openedLocationKey = useRef(location.key);
  const signedIn = useAuthStore((state) => Boolean(state.user));

  useEffect(() => {
    if (signedIn || location.key !== openedLocationKey.current) onClose();
  }, [signedIn, location.key, onClose]);

  return (
    <Dialog open onClose={onClose} modalId="player-avatar-auth-modal">
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (location.key === openedLocationKey.current && returnFocusTo.isConnected) {
            returnFocusTo.focus({ preventScroll: true });
          }
        }}
      >
        <DialogTitle className="sr-only">{t('games.joinToParticipate')}</DialogTitle>
        <PublicGamePrompt />
      </DialogContent>
    </Dialog>
  );
}
