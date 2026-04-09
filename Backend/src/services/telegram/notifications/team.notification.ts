import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatUserName } from '../../shared/notification-base';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { isBenignTelegramRecipientError } from '../telegramRecipientErrors';

type TeamMini = { id: string; name: string };
type UserMini = { id: string; firstName?: string | null; lastName?: string | null };

export async function sendUserTeamInviteTelegram(api: Api, team: TeamMini, inviter: UserMini, inviteeUserId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    inviteeUserId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: inviteeUserId },
    select: { id: true, telegramId: true, language: true },
  });
  if (!receiver?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const senderName = formatUserName(inviter);
  let message = `👥 ${escapeMarkdown(t('telegram.teamInviteReceived', lang))}\n\n`;
  message += `*${escapeMarkdown(senderName)}* ${escapeMarkdown(t('telegram.teamInvitedYou', lang))}\n`;
  message += `*${escapeMarkdown(team.name)}*`;

  const buttons = [
    [
      { text: t('telegram.acceptInvite', lang), callback_data: `uti:${team.id}:accept` },
      { text: t('telegram.declineInvite', lang), callback_data: `uti:${team.id}:decline` },
    ],
    [{ text: t('telegram.viewTeam', lang), url: `${config.frontendUrl}/user-team/${team.id}` }],
  ];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    await api.sendMessage(receiver.telegramId, finalMessage, options);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send team invite Telegram to user ${receiver.id}:`, error);
  }
}

export async function sendUserTeamInviteAcceptedTelegram(api: Api, team: TeamMini, accepter: UserMini, ownerId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    ownerId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, telegramId: true, language: true },
  });
  if (!receiver?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const name = escapeMarkdown(formatUserName(accepter));
  const teamNameEsc = escapeMarkdown(team.name);
  const body = t('telegram.teamMemberAcceptedBody', lang).replace(/\{name\}/g, name).replace(/\{team\}/g, teamNameEsc);
  const message = `✅ ${escapeMarkdown(t('telegram.teamMemberAcceptedTitle', lang))}\n\n${body}`;
  const buttons = [[{ text: t('telegram.viewTeam', lang), url: `${config.frontendUrl}/user-team/${team.id}` }]];
  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    await api.sendMessage(receiver.telegramId, finalMessage, options);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send team accepted Telegram to user ${receiver.id}:`, error);
  }
}

export async function sendUserTeamInviteDeclinedTelegram(api: Api, team: TeamMini, decliner: UserMini, ownerId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    ownerId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, telegramId: true, language: true },
  });
  if (!receiver?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const name = escapeMarkdown(formatUserName(decliner));
  const teamNameEsc = escapeMarkdown(team.name);
  const body = t('telegram.teamMemberDeclinedBody', lang).replace(/\{name\}/g, name).replace(/\{team\}/g, teamNameEsc);
  const message = `${escapeMarkdown(t('telegram.teamMemberDeclinedTitle', lang))}\n\n${body}`;
  try {
    await api.sendMessage(receiver.telegramId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send team declined Telegram to user ${receiver.id}:`, error);
  }
}

export async function sendUserTeamMemberRemovedTelegram(api: Api, team: TeamMini, removedUserId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    removedUserId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: removedUserId },
    select: { id: true, telegramId: true, language: true },
  });
  if (!receiver?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const teamNameEsc = escapeMarkdown(team.name);
  const body = t('telegram.teamYouWereRemovedBody', lang).replace(/\{team\}/g, teamNameEsc);
  const message = `${escapeMarkdown(t('telegram.teamYouWereRemovedTitle', lang))}\n\n${body}`;
  try {
    await api.sendMessage(receiver.telegramId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send team removed Telegram to user ${receiver.id}:`, error);
  }
}

export async function sendUserTeamMemberLeftTelegram(api: Api, team: TeamMini, leaver: UserMini, ownerId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    ownerId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, telegramId: true, language: true },
  });
  if (!receiver?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const name = escapeMarkdown(formatUserName(leaver));
  const teamNameEsc = escapeMarkdown(team.name);
  const body = t('telegram.teamMemberLeftBody', lang).replace(/\{name\}/g, name).replace(/\{team\}/g, teamNameEsc);
  const message = `${escapeMarkdown(t('telegram.teamMemberLeftTitle', lang))}\n\n${body}`;
  const buttons = [[{ text: t('telegram.viewTeam', lang), url: `${config.frontendUrl}/user-team/${team.id}` }]];
  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  try {
    await api.sendMessage(receiver.telegramId, finalMessage, options);
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send member left Telegram to user ${receiver.id}:`, error);
  }
}

export async function sendUserTeamDeletedTelegram(api: Api, teamName: string, memberUserId: string) {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    memberUserId,
    NotificationChannelType.TELEGRAM,
    PreferenceKey.SEND_TEAM_NOTIFICATIONS
  );
  if (!allowed) return;

  const receiver = await prisma.user.findUnique({
    where: { id: memberUserId },
    select: { id: true, telegramId: true, language: true },
  });
  if (!receiver?.telegramId) return;

  const lang = await getUserLanguageFromTelegramId(receiver.telegramId, undefined);
  const teamNameEsc = escapeMarkdown(teamName);
  const body = t('telegram.teamDeletedBody', lang).replace(/\{team\}/g, teamNameEsc);
  const message = `${escapeMarkdown(t('telegram.teamDeletedTitle', lang))}\n\n${body}`;
  try {
    await api.sendMessage(receiver.telegramId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    if (isBenignTelegramRecipientError(error)) return;
    console.error(`Failed to send team deleted Telegram to user ${receiver.id}:`, error);
  }
}
