import type { PushChatContext } from './parsePushChatContext';

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildPushReplyClientMutationId(
  ctx: Pick<PushChatContext, 'replyToken' | 'messageId'>,
  content: string
): Promise<string> {
  if (ctx.replyToken) {
    const hash = await sha256Hex(ctx.replyToken);
    return `push-reply-token-${hash.slice(0, 48)}`;
  }
  const contentHash = await sha256Hex(content);
  return `push-reply-msg-${ctx.messageId}-${contentHash.slice(0, 16)}`;
}
