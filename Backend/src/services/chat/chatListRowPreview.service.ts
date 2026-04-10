import { ChatContextType } from '@prisma/client';
import { MessageService } from './message.service';

const CHUNK = 28;

async function mapChunk<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const part = await Promise.all(slice.map(fn));
    out.push(...part);
  }
  return out;
}

export class ChatListRowPreviewService {
  static async getPreviews(
    userId: string,
    groupChannelIds: string[],
    userChatIds: string[]
  ): Promise<{ groupChannels: Record<string, unknown>; userChats: Record<string, unknown> }> {
    const gids = [...new Set(groupChannelIds.filter((id) => typeof id === 'string' && id.length > 0))];
    const ucids = [...new Set(userChatIds.filter((id) => typeof id === 'string' && id.length > 0))];

    const groupChannels: Record<string, unknown> = {};
    const userChats: Record<string, unknown> = {};

    for (let i = 0; i < gids.length; i += CHUNK) {
      const chunk = gids.slice(i, i + CHUNK);
      const groupResults = await mapChunk(chunk, 8, async (id) => {
        try {
          const last = await MessageService.getLatestMessageForListRowPreview(ChatContextType.GROUP, id, userId);
          return { id, last };
        } catch {
          return { id, last: null };
        }
      });
      for (const { id, last } of groupResults) {
        if (last) groupChannels[id] = last;
      }
    }

    for (let i = 0; i < ucids.length; i += CHUNK) {
      const chunk = ucids.slice(i, i + CHUNK);
      const userResults = await mapChunk(chunk, 8, async (id) => {
        try {
          const last = await MessageService.getLatestMessageForListRowPreview(ChatContextType.USER, id, userId);
          return { id, last };
        } catch {
          return { id, last: null };
        }
      });
      for (const { id, last } of userResults) {
        if (last) userChats[id] = last;
      }
    }

    return { groupChannels, userChats };
  }
}
