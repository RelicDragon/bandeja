import { useTranslation } from 'react-i18next';

export enum SystemMessageType {
  USER_JOINED_GAME = 'USER_JOINED_GAME',
  USER_JOINED_CHAT = 'USER_JOINED_CHAT',
  USER_LEFT_GAME = 'USER_LEFT_GAME',
  USER_LEFT_CHAT = 'USER_LEFT_CHAT',
  USER_INVITES_USER = 'USER_INVITES_USER',
  USER_ACCEPTED_INVITE = 'USER_ACCEPTED_INVITE',
  USER_DECLINED_INVITE = 'USER_DECLINED_INVITE',
  USER_ACCEPTED_JOIN_QUEUE = 'USER_ACCEPTED_JOIN_QUEUE',
  USER_DECLINED_JOIN_QUEUE = 'USER_DECLINED_JOIN_QUEUE',
  USER_TOGGLE_PLAYING_STATUS = 'USER_TOGGLE_PLAYING_STATUS',
  USER_KICKED = 'USER_KICKED',
  USER_PROMOTED_TO_ADMIN = 'USER_PROMOTED_TO_ADMIN',
  USER_REVOKED_ADMIN = 'USER_REVOKED_ADMIN',
  OWNERSHIP_TRANSFERRED = 'OWNERSHIP_TRANSFERRED'
}

export interface SystemMessageData {
  type: SystemMessageType;
  variables: Record<string, string>;
}

export const useSystemMessageTranslation = () => {
  const { t } = useTranslation();

  const translateSystemMessage = (messageData: SystemMessageData): string => {
    const { type, variables } = messageData;
    
    // Get the template from translations
    const template = t(`chat.systemMessages.${type}`, { defaultValue: '' });
    
    if (!template) {
      // Fallback to English template if translation not found
      const fallbackTemplates: Record<SystemMessageType, string> = {
        [SystemMessageType.USER_JOINED_GAME]: '{{userName}} joined the game',
        [SystemMessageType.USER_JOINED_CHAT]: '{{userName}} joined the chat',
        [SystemMessageType.USER_LEFT_GAME]: '{{userName}} left the game',
        [SystemMessageType.USER_LEFT_CHAT]: '{{userName}} left the chat',
        [SystemMessageType.USER_INVITES_USER]: '{{senderName}} invites {{receiverName}}',
        [SystemMessageType.USER_ACCEPTED_INVITE]: '{{userName}} joined the game',
        [SystemMessageType.USER_DECLINED_INVITE]: '{{userName}} declined the invite',
        [SystemMessageType.USER_ACCEPTED_JOIN_QUEUE]: '{{userName}} joined the game',
        [SystemMessageType.USER_DECLINED_JOIN_QUEUE]: '{{userName}} join request was declined',
        [SystemMessageType.USER_TOGGLE_PLAYING_STATUS]: '{{userName}} {{action}}',
        [SystemMessageType.USER_KICKED]: '{{userName}} was kicked from the game',
        [SystemMessageType.USER_PROMOTED_TO_ADMIN]: '{{userName}} was promoted to admin',
        [SystemMessageType.USER_REVOKED_ADMIN]: '{{userName}} admin privileges were revoked',
        [SystemMessageType.OWNERSHIP_TRANSFERRED]: '{{newOwnerName}} is now the owner of the game'
      };
      
      const fallbackTemplate = fallbackTemplates[type];
      return interpolateTemplate(fallbackTemplate, variables);
    }
    
    return interpolateTemplate(template, variables);
  };

  return { translateSystemMessage };
};

const interpolateTemplate = (template: string, variables: Record<string, string>): string => {
  let result = template;
  
  // Replace template variables with actual values
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    const safeValue = value || '';
    result = result.replace(new RegExp(placeholder, 'g'), safeValue);
  }
  
  return result;
};

export const parseSystemMessage = (content: string): SystemMessageData | null => {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type && parsed.variables) {
      return {
        type: parsed.type as SystemMessageType,
        variables: parsed.variables
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
