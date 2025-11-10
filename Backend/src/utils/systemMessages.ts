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
  OWNERSHIP_TRANSFERRED = 'OWNERSHIP_TRANSFERRED',
  BUG_STATUS_CHANGED = 'BUG_STATUS_CHANGED',
  BUG_TYPE_CHANGED = 'BUG_TYPE_CHANGED'
}

export interface SystemMessageTemplate {
  type: SystemMessageType;
  template: string;
  variables: string[];
}

export const SYSTEM_MESSAGE_TEMPLATES: Record<SystemMessageType, SystemMessageTemplate> = {
  [SystemMessageType.USER_JOINED_GAME]: {
    type: SystemMessageType.USER_JOINED_GAME,
    template: '{{userName}} joined the game',
    variables: ['userName']
  },
  [SystemMessageType.USER_JOINED_CHAT]: {
    type: SystemMessageType.USER_JOINED_CHAT,
    template: '{{userName}} joined the chat',
    variables: ['userName']
  },
  [SystemMessageType.USER_LEFT_GAME]: {
    type: SystemMessageType.USER_LEFT_GAME,
    template: '{{userName}} left the game',
    variables: ['userName']
  },
  [SystemMessageType.USER_LEFT_CHAT]: {
    type: SystemMessageType.USER_LEFT_CHAT,
    template: '{{userName}} left the chat',
    variables: ['userName']
  },
  [SystemMessageType.USER_INVITES_USER]: {
    type: SystemMessageType.USER_INVITES_USER,
    template: '{{senderName}} invites {{receiverName}}',
    variables: ['senderName', 'receiverName']
  },
  [SystemMessageType.USER_ACCEPTED_INVITE]: {
    type: SystemMessageType.USER_ACCEPTED_INVITE,
    template: '{{userName}} joined the game',
    variables: ['userName']
  },
  [SystemMessageType.USER_DECLINED_INVITE]: {
    type: SystemMessageType.USER_DECLINED_INVITE,
    template: '{{userName}} declined the invite',
    variables: ['userName']
  },
  [SystemMessageType.USER_ACCEPTED_JOIN_QUEUE]: {
    type: SystemMessageType.USER_ACCEPTED_JOIN_QUEUE,
    template: '{{userName}} joined the game',
    variables: ['userName']
  },
  [SystemMessageType.USER_DECLINED_JOIN_QUEUE]: {
    type: SystemMessageType.USER_DECLINED_JOIN_QUEUE,
    template: '{{userName}} join request was declined',
    variables: ['userName']
  },
  [SystemMessageType.USER_TOGGLE_PLAYING_STATUS]: {
    type: SystemMessageType.USER_TOGGLE_PLAYING_STATUS,
    template: '{{userName}} {{action}}',
    variables: ['userName', 'action']
  },
  [SystemMessageType.USER_KICKED]: {
    type: SystemMessageType.USER_KICKED,
    template: '{{userName}} was kicked from the game',
    variables: ['userName']
  },
  [SystemMessageType.USER_PROMOTED_TO_ADMIN]: {
    type: SystemMessageType.USER_PROMOTED_TO_ADMIN,
    template: '{{userName}} was promoted to admin',
    variables: ['userName']
  },
  [SystemMessageType.USER_REVOKED_ADMIN]: {
    type: SystemMessageType.USER_REVOKED_ADMIN,
    template: '{{userName}} admin privileges were revoked',
    variables: ['userName']
  },
  [SystemMessageType.OWNERSHIP_TRANSFERRED]: {
    type: SystemMessageType.OWNERSHIP_TRANSFERRED,
    template: '{{newOwnerName}} is now the owner of the game',
    variables: ['newOwnerName']
  },
  [SystemMessageType.BUG_STATUS_CHANGED]: {
    type: SystemMessageType.BUG_STATUS_CHANGED,
    template: 'Bug status changed to {{status}}',
    variables: ['status']
  },
  [SystemMessageType.BUG_TYPE_CHANGED]: {
    type: SystemMessageType.BUG_TYPE_CHANGED,
    template: 'Bug type changed to {{type}}',
    variables: ['type']
  }
};

export interface SystemMessageData {
  type: SystemMessageType;
  variables: Record<string, string>;
}

export const createSystemMessageContent = (data: SystemMessageData): string => {
  const template = SYSTEM_MESSAGE_TEMPLATES[data.type];
  if (!template) {
    throw new Error(`Unknown system message type: ${data.type}`);
  }

  let content = template.template;
  
  // Replace template variables with actual values
  for (const [key, value] of Object.entries(data.variables)) {
    const placeholder = `{{${key}}}`;
    const safeValue = value || '';
    content = content.replace(new RegExp(placeholder, 'g'), safeValue);
  }

  return content;
};

export const getUserDisplayName = (firstName?: string | null, lastName?: string | null): string => {
  return `${firstName || ''} ${lastName || ''}`.trim() || 'Someone';
};
