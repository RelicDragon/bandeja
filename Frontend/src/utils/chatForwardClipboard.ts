import type { ChatMessage } from '@/api/chat';

export function formatChatMessageForForwardClipboard(m: ChatMessage): string {
  const parts: string[] = [];
  if (m.content?.trim()) parts.push(m.content.trim());
  if (m.mediaUrls?.length) {
    m.mediaUrls.forEach((url, i) => {
      parts.push(`[media ${i + 1}] ${url}`);
    });
  }
  if (m.poll?.question) parts.push(`[poll] ${m.poll.question}`);
  return parts.join('\n\n').trim();
}
