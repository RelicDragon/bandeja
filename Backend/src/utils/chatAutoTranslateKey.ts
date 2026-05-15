import { ChatContextType, ChatType } from '@prisma/client';

/** Stable key for ChatAutoTranslateConfig; GAME uses chat tab, others use "". */
export function chatAutoTranslateTypeKey(
  chatContextType: ChatContextType,
  chatType?: ChatType | string | null
): string {
  if (chatContextType === 'GAME') {
    const t = (chatType ?? 'PUBLIC').toString().toUpperCase();
    return t === 'PHOTOS' ? 'PHOTOS' : t;
  }
  return '';
}
