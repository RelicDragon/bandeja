import type { Api } from 'grammy';
import { canDispatchBroadcast, canDispatchToUser } from '../../utils/notificationDispatchGuard';

export async function guardedTelegramSendMessage(
  api: Api,
  params: { userId: string; telegramId: string; kind: string },
  send: () => Promise<unknown>,
): Promise<boolean> {
  if (!(await canDispatchToUser(params.userId, 'telegram', params.kind))) {
    return false;
  }
  await send();
  return true;
}

export function guardedTelegramBroadcast(kind: string): boolean {
  return canDispatchBroadcast(kind);
}
