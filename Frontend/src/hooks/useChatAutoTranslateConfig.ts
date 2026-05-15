import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { chatAutoTranslateApi, type ChatAutoTranslateConfig } from '@/api/chatAutoTranslate';

export function useChatAutoTranslateConfig(
  chatContextType: ChatContextType | undefined,
  contextId: string | undefined,
  chatType?: ChatType
) {
  const [config, setConfig] = useState<ChatAutoTranslateConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!chatContextType || !contextId) return;
    setLoading(true);
    try {
      const data = await chatAutoTranslateApi.getConfig(chatContextType, contextId, chatType);
      setConfig(data);
    } catch {
      setConfig({ languageCodes: [], maxSlots: 2, canEdit: false });
    } finally {
      setLoading(false);
    }
  }, [chatContextType, contextId, chatType]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyLanguageCodes = useCallback(
    (languageCodes: string[]) => {
      setConfig((prev) =>
        prev
          ? { ...prev, languageCodes }
          : { languageCodes, maxSlots: 2, canEdit: true }
      );
      if (!chatContextType || !contextId || !config?.canEdit) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void chatAutoTranslateApi
          .setConfig(chatContextType, contextId, languageCodes, chatType)
          .then(setConfig)
          .catch(() => void load());
      }, 400);
    },
    [chatContextType, contextId, chatType, config?.canEdit, load]
  );

  const setFromSocket = useCallback((languageCodes: string[]) => {
    setConfig((prev) => (prev ? { ...prev, languageCodes } : null));
  }, []);

  return {
    config,
    loading,
    reload: load,
    applyLanguageCodes,
    setFromSocket,
  };
}
