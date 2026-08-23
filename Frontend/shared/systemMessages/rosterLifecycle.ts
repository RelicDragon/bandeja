export const INVITE_ONLY_CHAT_VIEWER_STATUSES = [
  'INVITED',
  'GUEST',
  'INVITE_DECLINED',
  'INVITE_CANCELLED',
] as const;

export const ROSTER_LIFECYCLE_SYSTEM_MESSAGE_TYPES = [
  'USER_JOINED_GAME',
  'USER_JOINED_CHAT',
  'USER_LEFT_GAME',
  'USER_LEFT_CHAT',
  'USER_INVITES_USER',
  'USER_ACCEPTED_INVITE',
  'USER_DECLINED_INVITE',
  'USER_JOINED_JOIN_QUEUE',
  'USER_ACCEPTED_JOIN_QUEUE',
  'USER_DECLINED_JOIN_QUEUE',
  'USER_CANCELED_JOIN_QUEUE',
  'USER_KICKED',
] as const;

export type InviteOnlyChatViewerStatus = (typeof INVITE_ONLY_CHAT_VIEWER_STATUSES)[number];
export type RosterLifecycleSystemMessageType = (typeof ROSTER_LIFECYCLE_SYSTEM_MESSAGE_TYPES)[number];

const INVITE_ONLY_STATUS_SET = new Set<string>(INVITE_ONLY_CHAT_VIEWER_STATUSES);
const ROSTER_TYPE_SET = new Set<string>(ROSTER_LIFECYCLE_SYSTEM_MESSAGE_TYPES);
const SYSTEM_PREVIEW_PREFIX = '[TYPE:SYSTEM]';

export function isInviteOnlyChatViewerStatus(
  status: string | null | undefined
): status is InviteOnlyChatViewerStatus {
  return typeof status === 'string' && INVITE_ONLY_STATUS_SET.has(status);
}

export function parseSystemMessageTypeFromContent(content: string | null | undefined): string | null {
  if (!content) return null;
  const json = content.startsWith(SYSTEM_PREVIEW_PREFIX)
    ? content.slice(SYSTEM_PREVIEW_PREFIX.length)
    : content;
  const trimmed = json.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown };
    return typeof parsed.type === 'string' ? parsed.type : null;
  } catch {
    return null;
  }
}

export function isRosterLifecycleSystemMessageType(type: string | null | undefined): boolean {
  return typeof type === 'string' && ROSTER_TYPE_SET.has(type);
}

export function isRosterLifecycleSystemMessageContent(content: string | null | undefined): boolean {
  return isRosterLifecycleSystemMessageType(parseSystemMessageTypeFromContent(content));
}

export function isRosterLifecycleSystemPreview(preview: string | null | undefined): boolean {
  return isRosterLifecycleSystemMessageContent(preview);
}

export function isRosterLifecycleSystemMessagePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (message && typeof message === 'object') {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string' && isRosterLifecycleSystemMessageContent(content)) return true;
  }
  return typeof record.content === 'string' && isRosterLifecycleSystemMessageContent(record.content);
}

export function shouldHideRosterLifecycleSystemMessage(params: {
  participantStatus?: string | null;
  senderId?: string | null;
  content?: string | null;
}): boolean {
  if (!isInviteOnlyChatViewerStatus(params.participantStatus)) return false;
  if (params.senderId) return false;
  return isRosterLifecycleSystemMessageContent(params.content);
}
