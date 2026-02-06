import { useTranslation } from 'react-i18next';

export enum SystemMessageType {
  USER_JOINED_GAME = 'USER_JOINED_GAME',
  USER_JOINED_CHAT = 'USER_JOINED_CHAT',
  USER_LEFT_GAME = 'USER_LEFT_GAME',
  USER_LEFT_CHAT = 'USER_LEFT_CHAT',
  USER_INVITES_USER = 'USER_INVITES_USER',
  USER_ACCEPTED_INVITE = 'USER_ACCEPTED_INVITE',
  USER_DECLINED_INVITE = 'USER_DECLINED_INVITE',
  USER_JOINED_JOIN_QUEUE = 'USER_JOINED_JOIN_QUEUE',
  USER_ACCEPTED_JOIN_QUEUE = 'USER_ACCEPTED_JOIN_QUEUE',
  USER_DECLINED_JOIN_QUEUE = 'USER_DECLINED_JOIN_QUEUE',
  USER_KICKED = 'USER_KICKED',
  USER_PROMOTED_TO_ADMIN = 'USER_PROMOTED_TO_ADMIN',
  USER_REVOKED_ADMIN = 'USER_REVOKED_ADMIN',
  OWNERSHIP_TRANSFERRED = 'OWNERSHIP_TRANSFERRED',
  BUG_STATUS_CHANGED = 'BUG_STATUS_CHANGED',
  BUG_TYPE_CHANGED = 'BUG_TYPE_CHANGED',
  GAME_CLUB_CHANGED = 'GAME_CLUB_CHANGED',
  GAME_DATE_TIME_CHANGED = 'GAME_DATE_TIME_CHANGED',
  USER_CHAT_REQUEST = 'USER_CHAT_REQUEST',
  USER_CHAT_ACCEPTED = 'USER_CHAT_ACCEPTED',
  USER_CHAT_DECLINED = 'USER_CHAT_DECLINED'
}

export interface SystemMessageData {
  type: SystemMessageType;
  variables: Record<string, string>;
}

const FALLBACK_TEMPLATES: Record<SystemMessageType, string> = {
  [SystemMessageType.USER_JOINED_GAME]: '{{userName}} joined the game',
  [SystemMessageType.USER_JOINED_CHAT]: '{{userName}} joined the chat',
  [SystemMessageType.USER_LEFT_GAME]: '{{userName}} left the game',
  [SystemMessageType.USER_LEFT_CHAT]: '{{userName}} left the chat',
  [SystemMessageType.USER_INVITES_USER]: '{{senderName}} invites {{receiverName}}',
  [SystemMessageType.USER_ACCEPTED_INVITE]: '{{userName}} joined the game',
  [SystemMessageType.USER_DECLINED_INVITE]: '{{userName}} declined the invite',
  [SystemMessageType.USER_JOINED_JOIN_QUEUE]: '{{userName}} requested to join the game',
  [SystemMessageType.USER_ACCEPTED_JOIN_QUEUE]: '{{userName}} joined the game',
  [SystemMessageType.USER_DECLINED_JOIN_QUEUE]: '{{userName}} join request was declined',
  [SystemMessageType.USER_KICKED]: '{{userName}} was kicked from the game',
  [SystemMessageType.USER_PROMOTED_TO_ADMIN]: '{{userName}} was promoted to admin',
  [SystemMessageType.USER_REVOKED_ADMIN]: '{{userName}} admin privileges were revoked',
  [SystemMessageType.OWNERSHIP_TRANSFERRED]: '{{newOwnerName}} is now the owner of the game',
  [SystemMessageType.BUG_STATUS_CHANGED]: 'Bug status changed to {{status}}',
  [SystemMessageType.BUG_TYPE_CHANGED]: 'Bug type changed to {{type}}',
  [SystemMessageType.GAME_CLUB_CHANGED]: 'Game location changed to {{clubName}}',
  [SystemMessageType.GAME_DATE_TIME_CHANGED]: 'Game date/time changed to {{dateTime}}',
  [SystemMessageType.USER_CHAT_REQUEST]: '{{requesterName}} requests to chat with you',
  [SystemMessageType.USER_CHAT_ACCEPTED]: '{{userName}} accepted the chat request',
  [SystemMessageType.USER_CHAT_DECLINED]: '{{userName}} declined the chat request'
};

const interpolateTemplate = (template: string, variables: Record<string, string>): string => {
  if (!template || typeof template !== 'string') {
    return '';
  }
  
  let result = template;
  const safeVariables = variables || {};
  
  // Replace template variables with actual values
  for (const [key, value] of Object.entries(safeVariables)) {
    const placeholder = `{{${key}}}`;
    const safeValue = value || '';
    result = result.replace(new RegExp(placeholder, 'g'), safeValue);
  }
  
  return result;
};

const translateSystemMessageData = (
  messageData: SystemMessageData,
  translateFn: (key: string, options?: { defaultValue?: string }) => string
): string => {
  const { type, variables } = messageData;
  
  if (!type) {
    return '';
  }
  
  const safeVariables = variables || {};
  
  const template = translateFn(`chat.systemMessages.${type}`, { defaultValue: '' });
  
  if (!template || typeof template !== 'string') {
    const fallbackTemplate = FALLBACK_TEMPLATES[type] || '';
    return interpolateTemplate(fallbackTemplate, safeVariables);
  }
  
  return interpolateTemplate(template, safeVariables);
};

export const useSystemMessageTranslation = () => {
  const { t } = useTranslation();

  const translateSystemMessage = (messageData: SystemMessageData): string => {
    return translateSystemMessageData(messageData, t);
  };

  return { translateSystemMessage };
};

export const parseSystemMessage = (content: string): SystemMessageData | null => {
  try {
    if (!content || typeof content !== 'string') {
      return null;
    }
    
    const parsed = JSON.parse(content);
    if (parsed.type && parsed.variables && typeof parsed.variables === 'object') {
      return {
        type: parsed.type as SystemMessageType,
        variables: parsed.variables || {}
      };
    }
  } catch (error) {
    // Not a JSON system message, return null
  }
  return null;
};

export const getSystemMessageText = (content: string): string => {
  try {
    const parsed = JSON.parse(content);
    if (parsed.text) {
      return parsed.text;
    }
  } catch (error) {
    // Not a JSON system message, return original content
  }
  return content;
};

export const formatSystemMessageForDisplay = (
  content: string,
  translateFn: (key: string, options?: { defaultValue?: string }) => string
): string => {
  const systemMessageData = parseSystemMessage(content);
  
  if (!systemMessageData) {
    return content;
  }
  
  if (!systemMessageData.type) {
    return content;
  }
  
  return translateSystemMessageData(systemMessageData, translateFn);
};
