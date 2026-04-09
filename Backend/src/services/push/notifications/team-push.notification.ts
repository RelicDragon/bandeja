import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatUserName } from '../../shared/notification-base';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';

type TeamMini = { id: string; name: string };
type UserMini = { id: string; firstName?: string | null; lastName?: string | null; avatar?: string | null };

function oneLine(s: string) {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

export async function createUserTeamInvitePushNotification(
  team: TeamMini,
  inviter: UserMini,
  inviteeUserId: string
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    inviteeUserId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: inviteeUserId },
    select: { id: true, language: true },
  });
  if (!receiver) return null;

  const lang = receiver.language || 'en';
  const senderName = oneLine(formatUserName(inviter));
  const title = t('telegram.teamInviteReceived', lang);
  const body = `${senderName} ${t('telegram.teamInvitedYou', lang)}\n${oneLine(team.name)}`;

  return {
    type: NotificationType.TEAM_INVITE,
    title,
    body,
    data: { teamId: team.id },
    actions: [
      { id: 'accept', title: t('telegram.acceptInvite', lang), action: 'accept' },
      { id: 'decline', title: t('telegram.declineInvite', lang), action: 'decline' },
    ],
    sound: 'default',
  };
}

export async function createUserTeamInviteAcceptedPushNotification(
  team: TeamMini,
  accepter: UserMini,
  ownerId: string
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    ownerId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { language: true },
  });
  if (!receiver) return null;
  const lang = receiver.language || 'en';
  const name = formatUserName(accepter);
  return {
    type: NotificationType.TEAM_INVITE_ACCEPTED,
    title: t('telegram.teamMemberAcceptedTitle', lang),
    body: t('telegram.teamMemberAcceptedBody', lang).replace(/\{name\}/g, oneLine(name)).replace(/\{team\}/g, oneLine(team.name)),
    data: { teamId: team.id },
    sound: 'default',
  };
}

export async function createUserTeamInviteDeclinedPushNotification(
  team: TeamMini,
  decliner: UserMini,
  ownerId: string
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    ownerId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { language: true },
  });
  if (!receiver) return null;
  const lang = receiver.language || 'en';
  const name = formatUserName(decliner);
  return {
    type: NotificationType.TEAM_INVITE_DECLINED,
    title: t('telegram.teamMemberDeclinedTitle', lang),
    body: t('telegram.teamMemberDeclinedBody', lang).replace(/\{name\}/g, oneLine(name)).replace(/\{team\}/g, oneLine(team.name)),
    data: { teamId: team.id },
    sound: 'default',
  };
}

export async function createUserTeamMemberRemovedPushNotification(team: TeamMini, removedUserId: string): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    removedUserId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: removedUserId },
    select: { language: true },
  });
  if (!receiver) return null;
  const lang = receiver.language || 'en';
  return {
    type: NotificationType.TEAM_MEMBER_REMOVED,
    title: t('telegram.teamYouWereRemovedTitle', lang),
    body: t('telegram.teamYouWereRemovedBody', lang).replace(/\{team\}/g, oneLine(team.name)),
    data: { teamId: team.id },
    sound: 'default',
  };
}

export async function createUserTeamMemberLeftPushNotification(
  team: TeamMini,
  leaver: UserMini,
  ownerId: string
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    ownerId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { language: true },
  });
  if (!receiver) return null;
  const lang = receiver.language || 'en';
  const name = formatUserName(leaver);
  return {
    type: NotificationType.TEAM_MEMBER_LEFT,
    title: t('telegram.teamMemberLeftTitle', lang),
    body: t('telegram.teamMemberLeftBody', lang).replace(/\{name\}/g, oneLine(name)).replace(/\{team\}/g, oneLine(team.name)),
    data: { teamId: team.id },
    sound: 'default',
  };
}

export async function createUserTeamDeletedPushNotification(teamName: string, memberUserId: string): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    memberUserId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: memberUserId },
    select: { language: true },
  });
  if (!receiver) return null;
  const lang = receiver.language || 'en';
  return {
    type: NotificationType.TEAM_DELETED,
    title: t('telegram.teamDeletedTitle', lang),
    body: t('telegram.teamDeletedBody', lang).replace(/\{team\}/g, oneLine(teamName)),
    data: {},
    sound: 'default',
  };
}
