import { useCallback, useEffect, useState } from 'react';
import { probeGameChatChannelActive } from '@/services/chat/gameChatChannelProbe';

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
        const fresh = refreshToken > 0;
        const [privateActive, adminsActive] = await Promise.all([
          probeGameChatChannelActive(gameId, 'PRIVATE', { fresh }),
          probeGameChatChannelActive(gameId, 'ADMINS', { fresh }),
        ]);
        if (cancelled) return;
        setPrivateEnabled(privateActive);
        setAdminsEnabled(adminsActive);
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
