import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { isCapacitor } from '@/utils/capacitor';

/** Plain-text copy of a chat message: native clipboard in the app, then the web APIs. */
export async function copyAgentMessageText(text: string): Promise<boolean> {
  if (isCapacitor()) {
    try {
      await Clipboard.write({ string: text });
      return true;
    } catch {
      // fall through to the web clipboard
    }
  }
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand
    }
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export type AgentShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

function isAbort(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  return e?.name === 'AbortError' || /cancel/i.test(e?.message ?? '');
}

/** Plain-text share sheet (no URL); copies instead where there is no share sheet. */
export async function shareAgentMessageText(text: string): Promise<AgentShareOutcome> {
  if (isCapacitor()) {
    try {
      await Share.share({ text });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  if (typeof navigator.share === 'function' && window.isSecureContext) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  return (await copyAgentMessageText(text)) ? 'copied' : 'failed';
}

/**
 * Assistant replies are markdown: copy / share them as readable plain text. Link labels stay;
 * external URLs follow in parentheses (in-app paths mean nothing outside the app).
 */
export function agentMarkdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) =>
      /^https?:\/\//i.test(url) && url !== label ? `${label} (${url})` : label,
    )
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*(\n|$)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
