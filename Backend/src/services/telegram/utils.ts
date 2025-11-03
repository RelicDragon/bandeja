import { t } from '../../utils/translations';

export function getLanguageCode(telegramLanguageCode: string | undefined): string {
  if (!telegramLanguageCode) return 'en';
  
  const code = telegramLanguageCode.toLowerCase().split('-')[0];
  const supportedLanguages = ['en', 'ru', 'sr', 'es'];
  
  return supportedLanguages.includes(code) ? code : 'en';
}

export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

export function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function convertMarkdownMessageToHTML(markdownMessage: string): string {
  let html = markdownMessage;
  
  html = html.replace(/&/g, '&amp;');
  html = html.replace(/</g, '&lt;');
  html = html.replace(/>/g, '&gt;');
  
  html = html.replace(/\\\\/g, '\x00BACKSLASH\x00');
  html = html.replace(/\\\*/g, '*');
  html = html.replace(/\\_/g, '_');
  html = html.replace(/\\\[/g, '[');
  html = html.replace(/\\\]/g, ']');
  html = html.replace(/\\\(/g, '(');
  html = html.replace(/\\\)/g, ')');
  html = html.replace(/\x00BACKSLASH\x00/g, '\\');
  
  html = html.replace(/\*([^*]+)\*/g, '<b>$1</b>');
  
  return html;
}

export function formatDuration(startTime: Date, endTime: Date, lang: string = 'en'): string {
  const durationMs = endTime.getTime() - startTime.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  const hLabel = t('common.h', lang);
  const mLabel = t('common.m', lang);
  
  if (minutes === 0) return `${hours}${hLabel}`;
  return `${hours}${hLabel} ${minutes}${mLabel}`;
}

