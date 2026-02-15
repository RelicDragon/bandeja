import i18n from '@/i18n/config';

export interface ParsedUrl {
  type: 'url' | 'text';
  content: string;
  url?: string;
  displayText?: string;
  urlType?: 'channel' | 'group' | 'game' | 'user-chat' | 'profile' | 'other';
}

const APP_DOMAINS = ['bandeja.me', 'localhost', '127.0.0.1'];
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}[^\s<>"']*)/gi;

function normalizeUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
}

function isAppDomain(url: string): boolean {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    return APP_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function formatAppUrl(url: string): { displayText: string; urlType: 'channel' | 'group' | 'game' | 'user-chat' | 'profile' | 'other' } {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    const path = urlObj.pathname;

    if (path.startsWith('/bugs/') && path !== '/bugs') {
      return { displayText: i18n.t('chats.bugs', { defaultValue: 'Bug chat' }), urlType: 'channel' };
    }
    if (path.startsWith('/channel-chat/')) {
      return { displayText: i18n.t('common.viewChannel'), urlType: 'channel' };
    } else if (path.startsWith('/group-chat/')) {
      return { displayText: i18n.t('common.viewGroup'), urlType: 'group' };
    } else if (path.startsWith('/games/')) {
      return { displayText: i18n.t('common.viewGame'), urlType: 'game' };
    } else if (path.startsWith('/user-chat/')) {
      return { displayText: i18n.t('common.openChat'), urlType: 'user-chat' };
    } else if (path.startsWith('/profile/')) {
      return { displayText: i18n.t('common.viewProfile'), urlType: 'profile' };
    }
    
    return { displayText: i18n.t('common.openLink'), urlType: 'other' };
  } catch {
    return { displayText: url, urlType: 'other' };
  }
}

export function parseUrls(text: string): ParsedUrl[] {
  const parts: ParsedUrl[] = [];
  let lastIndex = 0;
  let match;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    const url = match[0];
    const isApp = isAppDomain(url);
    const urlInfo = isApp ? formatAppUrl(url) : { displayText: url, urlType: 'other' as const };
    const fullUrl = normalizeUrl(url);

    parts.push({
      type: 'url',
      content: match[0],
      url: fullUrl,
      displayText: urlInfo.displayText,
      urlType: urlInfo.urlType,
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}
