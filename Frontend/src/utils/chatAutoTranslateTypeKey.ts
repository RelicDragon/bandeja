import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

export function chatAutoTranslateTypeKey(
  contextType: ChatContextType,
  chatType?: ChatType | string | null
): string {
  if (contextType === 'GAME') {
    return normalizeChatType((chatType as ChatType) ?? 'PUBLIC');
  }
  return '';
}
