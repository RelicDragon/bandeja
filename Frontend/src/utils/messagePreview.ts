import { TFunction } from 'i18next';

/**
 * Parses a message preview and translates special tags
 */
export function parseMessagePreview(preview: string | null | undefined, t: TFunction): string {
    if (!preview) return '';

    // Handle media-only messages
    if (preview === '[TYPE:MEDIA]') {
        return t('chat.messages.media', '[Media]');
    }

    // Handle poll messages
    if (preview.startsWith('[TYPE:POLL]')) {
        const question = preview.substring(11); // Remove [TYPE:POLL] prefix
        return `📊 ${t('chat.poll.poll')}: ${question}`;
    }

    // Handle system messages
    if (preview.startsWith('[TYPE:SYSTEM]')) {
        const jsonStr = preview.substring(13); // Remove [TYPE:SYSTEM] prefix
        try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type && parsed.text) {
                // System message text should already be formatted, just return it
                return parsed.text;
            }
        } catch {
            return preview;
        }
    }

    // Regular text message
    return preview;
}
