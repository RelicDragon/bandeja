import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { socketService } from '@/services/socketService';
import type { ChatContextType } from '@/api/chat';

const TYPING_SERVER_TTL_MS = 6000;
/** Keep below server TTL (~6s) so "still typing" is refreshed while keys keep coming. */
const TYPING_REFRESH_EMIT_MS = 2800;
const TYPING_SILENCE_MS = 2800;

type Params = {
  contextType: ChatContextType;
  contextId: string | undefined;
  enabled: boolean;
};

export function useTypingIndicator({ contextType, contextId, enabled }: Params) {
  const userId = useAuthStore((s) => s.user?.id);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  const lastTrueEmitAtRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearSilenceTimer();
    lastTrueEmitAtRef.current = 0;
    if (!contextId) return;
    socketService.emitTypingIndicator(contextType, contextId, false);
  }, [contextType, contextId, clearSilenceTimer]);

  const notifyKeystroke = useCallback(() => {
    if (!contextId || !enabled || !userId) return;
    const now = Date.now();
    if (now - lastTrueEmitAtRef.current >= TYPING_REFRESH_EMIT_MS) {
      socketService.emitTypingIndicator(contextType, contextId, true);
      lastTrueEmitAtRef.current = now;
    }
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      lastTrueEmitAtRef.current = 0;
      socketService.emitTypingIndicator(contextType, contextId, false);
    }, TYPING_SILENCE_MS);
  }, [contextType, contextId, enabled, userId, clearSilenceTimer]);

  useEffect(() => {
    if (!contextId || !enabled) {
      setTypingUserIds([]);
      return;
    }

    const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const clearExpiry = (uid: string) => {
      const t = expiryTimers.get(uid);
      if (t) {
        clearTimeout(t);
        expiryTimers.delete(uid);
      }
    };

    const handler = (data: {
      contextType?: ChatContextType;
      contextId?: string;
      gameId?: string;
      userId?: string;
      isTyping?: boolean;
      timestamp?: string;
    }) => {
      const payloadCt = data.contextType ?? (data.gameId ? ('GAME' as const) : undefined);
      const payloadCid = data.contextId ?? data.gameId;
      if (!payloadCt || !payloadCid || typeof data.userId !== 'string') return;
      if (payloadCt !== contextType || payloadCid !== contextId) return;
      if (data.userId === userId) return;

      const uid = data.userId;
      clearExpiry(uid);
      if (data.isTyping) {
        const t = setTimeout(() => {
          expiryTimers.delete(uid);
          setTypingUserIds((prev) => prev.filter((id) => id !== uid));
        }, TYPING_SERVER_TTL_MS + 1000);
        expiryTimers.set(uid, t);
        setTypingUserIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
      } else {
        setTypingUserIds((prev) => prev.filter((id) => id !== uid));
      }
    };

    socketService.on('typing-indicator', handler);
    return () => {
      socketService.off('typing-indicator', handler);
      expiryTimers.forEach(clearTimeout);
      expiryTimers.clear();
    };
  }, [contextType, contextId, enabled, userId]);

  useEffect(() => {
    if (!enabled && contextId) {
      clearSilenceTimer();
      lastTrueEmitAtRef.current = 0;
      socketService.emitTypingIndicator(contextType, contextId, false);
    }
  }, [enabled, contextId, contextType, clearSilenceTimer]);

  useEffect(() => {
    return () => {
      clearSilenceTimer();
      if (contextId) {
        socketService.emitTypingIndicator(contextType, contextId, false);
      }
    };
  }, [contextType, contextId, clearSilenceTimer]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') stopTyping();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [stopTyping]);

  return { typingUserIds, notifyKeystroke, stopTyping };
}
