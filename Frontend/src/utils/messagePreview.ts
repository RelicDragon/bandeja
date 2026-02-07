import { TFunction } from 'i18next';
import { formatSystemMessageForDisplay } from './systemMessages';

export function parseMessagePreview(preview: string | null | undefined, t: TFunction): string {
    if (!preview) return '';

    if (preview === '[TYPE:MEDIA]') {
        return t('chat.messages.media', '[Media]');
    }

    if (preview.startsWith('[TYPE:POLL]')) {
        const question = preview.substring(11);
        return `📊 ${t('chat.poll.poll')}: ${question}`;
    }

    if (preview.startsWith('[TYPE:SYSTEM]')) {
        const jsonStr = preview.substring(13);
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type && parsed.variables) {
                return formatSystemMessageForDisplay(jsonStr, t);
            }
            if (parsed.type && parsed.text) {
                return parsed.text;
            }
        } catch {
            return preview;
        }
    }

    return preview;
}
