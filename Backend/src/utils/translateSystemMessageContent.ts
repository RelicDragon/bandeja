import { resolveSystemMessageTranslationKey } from '@bandeja/shared/systemMessages/resolveSystemMessageTranslationKey';
import { resolveGameClubPlace } from '../services/shared/notification-base';
import { t } from './translations';

type ParsedSystemMessage = {
  type?: string;
  variables?: Record<string, string>;
  text?: string;
};

function parseSystemMessageContent(content: string): {
  messageData: ParsedSystemMessage | null;
  messageContent: string;
} {
  let messageData: ParsedSystemMessage | null = null;
  let messageContent = '';

  try {
    messageData = JSON.parse(content) as ParsedSystemMessage;
    messageContent = messageData.text || content;
  } catch {
    messageContent = content || '';
  }

  return { messageData, messageContent };
}

function resolveTemplate(
  messageType: string,
  lang: string,
  entityType?: string | null,
  fallbackText?: string,
): string {
  const entityKey = resolveSystemMessageTranslationKey(messageType, entityType);
  let template = t(entityKey, lang);

  if (template === entityKey) {
    const baseKey = resolveSystemMessageTranslationKey(messageType);
    template = t(baseKey, lang);
  }

  if (template === resolveSystemMessageTranslationKey(messageType)) {
    return fallbackText || '';
  }

  return template;
}

function interpolateTemplate(
  template: string,
  messageType: string,
  variables: Record<string, string>,
  lang: string,
): string {
  const resolvedVariables = { ...variables };

  if (messageType === 'GAME_CLUB_CHANGED' && !resolvedVariables.clubName?.trim()) {
    resolvedVariables.clubName = resolveGameClubPlace({}, lang);
  }

  if (messageType === 'GAME_DATE_TIME_CHANGED' && !resolvedVariables.dateTime?.trim()) {
    const datetimeKey = 'games.datetimeNotSet';
    resolvedVariables.dateTime =
      t(datetimeKey, lang) !== datetimeKey ? t(datetimeKey, lang) : 'Time is not set yet';
  }

  let result = template;
  for (const [key, value] of Object.entries(resolvedVariables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
  }

  return result;
}

export function translateSystemMessageContent(
  message: { content: string },
  lang: string,
  entityType?: string | null,
): string {
  const { messageData, messageContent } = parseSystemMessageContent(message.content);

  if (!messageData?.type || !messageData.variables) {
    return messageContent;
  }

  const template = resolveTemplate(
    messageData.type,
    lang,
    entityType,
    messageData.text || messageContent,
  );

  if (!template) {
    return messageContent;
  }

  return interpolateTemplate(template, messageData.type, messageData.variables, lang);
}
