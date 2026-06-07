import type { GroupChannel } from '@/api/chat';
import type { Game } from '@/types';

export type CommonChatKind = 'group' | 'game' | 'bug' | 'channel' | 'market';

export interface CommonChatItem {
  id: string;
  kind: CommonChatKind;
  updatedAt: string;
  groupChannel?: GroupChannel;
  game?: Game;
}
