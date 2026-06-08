import { useMemo } from 'react';
import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import type { GroupChannel } from '@/api/chat';
import type { Game } from '@/types';
import { useChatAutoTranslateConfig } from '@/hooks/useChatAutoTranslateConfig';
import { isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { getGameParticipationState } from '@/utils/gameParticipationState';

export interface UseThreadAutoTranslateParams {
  id: string | undefined;
  contextType: ChatContextType;
  effectiveChatType: ChatType;
  userId: string | undefined;
  userIsAdmin?: boolean | null;
  groupChannel: GroupChannel | null;
  game: Game | null;
  userChat: { user1Id: string; user2Id: string } | null;
  bugSenderId?: string | null;
}

export function useThreadAutoTranslate({
  id,
  contextType,
  effectiveChatType,
  userId,
  userIsAdmin,
  groupChannel,
  game,
  userChat,
  bugSenderId,
}: UseThreadAutoTranslateParams) {
  const chatTypeForConfig = contextType === 'GAME' ? effectiveChatType : undefined;

  const { config, loading, applyLanguageCodes, setFromSocket, reload } = useChatAutoTranslateConfig(
    id ? contextType : undefined,
    id,
    chatTypeForConfig
  );

  const canEditAutoTranslate = useMemo(() => {
    if (!userId || !id) return false;
    if (contextType === 'USER' && userChat) {
      return userChat.user1Id === userId || userChat.user2Id === userId;
    }
    if (contextType === 'GROUP' && groupChannel) {
      if (groupChannel.isCityGroup && userIsAdmin) return true;
      return isGroupChannelAdminOrOwner(groupChannel, userId);
    }
    if (contextType === 'GAME' && game) {
      const p = getGameParticipationState(game.participants ?? [], userId, game);
      return p.isAdminOrOwner;
    }
    if (contextType === 'BUG') {
      return bugSenderId === userId || !!userIsAdmin;
    }
    return false;
  }, [userId, id, contextType, userChat, groupChannel, game, userIsAdmin, bugSenderId]);

  const headerLangHint = useMemo(() => {
    const codes = config?.languageCodes ?? [];
    if (codes.length === 0) return null;
    return codes.map((c) => c.toUpperCase()).join(' · ');
  }, [config?.languageCodes]);

  return {
    autoTranslateConfig: config,
    autoTranslateLoading: loading,
    applyAutoTranslateLanguageCodes: applyLanguageCodes,
    setAutoTranslateFromSocket: setFromSocket,
    reloadAutoTranslateConfig: reload,
    canEditAutoTranslate: config?.canEdit ?? canEditAutoTranslate,
    autoTranslateHeaderHint: headerLangHint,
    effectiveMaxSlots: config?.maxSlots ?? 2,
  };
}
