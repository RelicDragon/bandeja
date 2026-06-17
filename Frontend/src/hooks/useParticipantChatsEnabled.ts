import { useCallback, useEffect, useState } from 'react';
import { chatApi } from '@/api/chat';
import { gameChatChannelIsActive } from '@/utils/gameChatChannelActivity';

export interface ParticipantChatsEnabledState {
  isLoading: boolean;
  privateEnabled: boolean;
  adminsEnabled: boolean;
  bothEnabled: boolean;
  refresh: () => void;
}

export function useParticipantChatsEnabled(gameId: string | undefined): ParticipantChatsEnabledState {
  const [isLoading, setIsLoading] = useState(true);
  const [privateEnabled, setPrivateEnabled] = useState(false);
  const [adminsEnabled, setAdminsEnabled] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!gameId) {
      setPrivateEnabled(false);
      setAdminsEnabled(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const [privateMessages, adminsMessages] = await Promise.all([
          chatApi.getGameMessages(gameId, 1, 20, 'PRIVATE'),
          chatApi.getGameMessages(gameId, 1, 20, 'ADMINS'),
        ]);
        if (cancelled) return;
        setPrivateEnabled(gameChatChannelIsActive(privateMessages, 'PRIVATE'));
        setAdminsEnabled(gameChatChannelIsActive(adminsMessages, 'ADMINS'));
      } catch {
        if (!cancelled) {
          setPrivateEnabled(false);
          setAdminsEnabled(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId, refreshToken]);

  return {
    isLoading,
    privateEnabled,
    adminsEnabled,
    bothEnabled: privateEnabled && adminsEnabled,
    refresh,
  };
}
