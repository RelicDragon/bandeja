import type { LinkPreviewData } from '@/api/linkPreview';

export function linkPreviewCopyPath(copyKey: string, field: 'title' | 'description'): string {
  return `chat.linkPreview.${copyKey}.${field}`;
}

export function resolveLinkPreviewTitle(
  preview: LinkPreviewData,
  t: (key: string, opts?: { defaultValue?: string }) => string
): string {
  const raw = preview.title?.trim();
  if (raw) {
    if (preview.provider === 'instagram') {
      const account = raw.match(/^(@[^\s:]+)\s+on Instagram(?::.*)?$/i);
      if (account?.[1]) return `${account[1]} on Instagram`;
      const separator = raw.indexOf(':');
      return (separator > 0 ? raw.slice(0, separator) : raw).trim().slice(0, 80);
    }
    return raw;
  }
  if (preview.titleKey) {
    const translated = t(linkPreviewCopyPath(preview.titleKey, 'title'), { defaultValue: '' }).trim();
    if (translated) return translated;
  }
  return preview.hostname || preview.siteName || t('chat.linkPreview.openLink', { defaultValue: 'Open link' });
}

export function resolveLinkPreviewDescription(
  preview: LinkPreviewData,
  t: (key: string, opts?: { defaultValue?: string }) => string,
  title: string
): string | null {
  if (preview.provider === 'instagram') return null;
  const raw = preview.description?.trim();
  if (raw && raw !== title) return raw;
  if (preview.descriptionKey) {
    const translated = t(linkPreviewCopyPath(preview.descriptionKey, 'description'), {
      defaultValue: '',
    }).trim();
    if (translated && translated !== title) return translated;
  }
  return null;
}

export function resolveLinkPreviewBadge(
  badgeKey: string | null | undefined,
  t: (key: string, opts?: { defaultValue?: string }) => string
): string | null {
  if (!badgeKey) return null;
  const translated = t(`chat.linkPreview.badge.${badgeKey}`, { defaultValue: '' }).trim();
  return translated || null;
}
