import type { Api } from 'grammy';
import type { PendingDeclineInvite } from './types';
import { declineInviteFromTelegram } from './invite.service';
import { updateInviteTelegramMessage } from './inviteMessageUpdate';
import { t } from '../../utils/translations';

export const DECLINE_INVITE_PENDING_TTL_MS = 10 * 60 * 1000;

export function parseLeadingBotCommand(text: string): string | null {
  const raw = text.trim().split(/\s+/)[0];
  if (!raw.startsWith('/')) return null;
  return raw.split('@')[0].toLowerCase();
}

export function isDeclineInvitePendingExpired(pending: PendingDeclineInvite, now = Date.now()): boolean {
  return now - pending.createdAt > DECLINE_INVITE_PENDING_TTL_MS;
}

export async function finalizeTelegramInviteDecline(args: {
  api: Api;
  pending: PendingDeclineInvite;
  declineMessage?: string;
}): Promise<{ success: boolean; feedback: string }> {
  const { api, pending, declineMessage } = args;
  const result = await declineInviteFromTelegram(
    pending.inviteId,
    pending.userId,
    declineMessage
  );

  const statusText = result.success
    ? t('telegram.inviteDeclined', pending.lang)
    : t(result.message, pending.lang) || t('telegram.inviteActionError', pending.lang);

  try {
    await updateInviteTelegramMessage({
      api,
      chatId: pending.inviteMessageChatId,
      messageId: pending.inviteMessageId,
      originalText: pending.inviteMessageText,
      statusLine: statusText,
      success: result.success,
      replyMarkup: pending.inviteReplyMarkup,
    });
  } catch (editError) {
    console.error('Failed to edit invite message after decline:', editError);
  }

  return {
    success: result.success,
    feedback: result.success ? t('telegram.inviteDeclined', pending.lang) : statusText,
  };
}
