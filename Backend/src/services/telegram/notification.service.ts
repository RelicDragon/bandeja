import { Bot } from 'grammy';
import { sendGameChatNotification } from './notifications/game-chat.notification';
import { sendBugChatNotification } from './notifications/bug-chat.notification';
import { sendUserChatNotification } from './notifications/user-chat.notification';
import { sendGroupChatNotification } from './notifications/group-chat.notification';
import { sendInviteNotification } from './notifications/invite.notification';
import { sendGameCard } from './notifications/game-card.notification';
import { sendGameSystemMessageNotification } from './notifications/game-system-message.notification';
import { sendLeagueRoundStartNotification } from './notifications/league-round-start.notification';
import { sendGameReminderNotification } from './notifications/game-reminder.notification';
import { sendNewGameNotification } from './notifications/new-game.notification';
import { sendBetResolvedNotification, sendBetNeedsReviewNotification, sendBetCancelledNotification } from './notifications/bet-resolved.notification';
import { sendTransactionNotification as sendTransactionNotificationFunc } from './notifications/transaction.notification';
import { sendNewMarketItemNotification } from './notifications/new-market-item.notification';
import { sendNewBugNotification } from './notifications/new-bug.notification';
import { sendLeagueGameAssignedNotification as sendLeagueGameAssignedTelegram } from './notifications/league-game-assigned.notification';
import { sendGameCancelledNotification as sendGameCancelledTelegram } from './notifications/game-cancelled.notification';
import {
  sendUserTeamInviteTelegram,
  sendUserTeamInviteAcceptedTelegram,
  sendUserTeamInviteDeclinedTelegram,
  sendUserTeamMemberRemovedTelegram,
  sendUserTeamMemberLeftTelegram,
  sendUserTeamDeletedTelegram,
} from './notifications/team.notification';

class TelegramNotificationService {
  private bot: Bot | null = null;

  initialize(bot: Bot | null) {
    this.bot = bot;
  }

  async sendGameChatNotification(message: any, game: any, sender: any) {
    if (!this.bot) return;
    await sendGameChatNotification(this.bot.api, message, game, sender);
  }

  async sendBugChatNotification(message: any, bug: any, sender: any) {
    if (!this.bot) return;
    await sendBugChatNotification(this.bot.api, message, bug, sender);
  }

  async sendUserChatNotification(message: any, userChat: any, sender: any) {
    if (!this.bot) return;
    await sendUserChatNotification(this.bot.api, message, userChat, sender);
  }

  async sendGroupChatNotification(message: any, groupChannel: any, sender: any) {
    if (!this.bot) return;
    await sendGroupChatNotification(this.bot.api, message, groupChannel, sender);
  }

  async sendInviteNotification(invite: any) {
    if (!this.bot) return;
    await sendInviteNotification(this.bot.api, invite);
  }

  async sendLeagueGameAssignedNotification(game: any, userId: string) {
    if (!this.bot) return;
    await sendLeagueGameAssignedTelegram(this.bot.api, game, userId);
  }

  async sendGameCard(gameId: string, telegramId: string, botApi?: any) {
    const api = botApi || this.bot?.api;
    if (!api) {
      throw new Error('Bot API not available');
    }
    await sendGameCard(api, gameId, telegramId);
  }

  async sendGameSystemMessageNotification(message: any, game: any) {
    if (!this.bot) return;
    await sendGameSystemMessageNotification(this.bot.api, message, game);
  }

  async sendLeagueRoundStartNotification(game: any, user: any) {
    if (!this.bot) return;
    await sendLeagueRoundStartNotification(this.bot.api, game, user);
  }

  async sendGameReminderNotification(gameId: string, hoursBeforeStart: number) {
    if (!this.bot) return;
    await sendGameReminderNotification(this.bot.api, gameId, hoursBeforeStart);
  }

  async sendGameCancelledNotification(meta: import('./notifications/game-cancelled.notification').GameCancelledMeta, recipientUserIds: string[]) {
    if (!this.bot) return;
    await sendGameCancelledTelegram(this.bot.api, meta, recipientUserIds);
  }

  async sendNewGameNotification(game: any, recipient: any) {
    if (!this.bot) return;
    await sendNewGameNotification(this.bot.api, game, recipient);
  }

  async sendBetResolvedNotification(betId: string, userId: string, isWinner: boolean, totalCoinsWon?: number) {
    if (!this.bot) return;
    await sendBetResolvedNotification(this.bot.api, betId, userId, isWinner, totalCoinsWon);
  }

  async sendBetNeedsReviewNotification(betId: string, userId: string) {
    if (!this.bot) return;
    await sendBetNeedsReviewNotification(this.bot.api, betId, userId);
  }

  async sendBetCancelledNotification(betId: string, userId: string) {
    if (!this.bot) return;
    await sendBetCancelledNotification(this.bot.api, betId, userId);
  }

  async sendNewMarketItemNotification(
    marketItem: { id: string; title: string; description: string | null; priceCents: number | null; currency: string },
    cityName: string,
    recipient: { id: string; telegramId: string; language?: string | null }
  ) {
    if (!this.bot) return;
    await sendNewMarketItemNotification(this.bot.api, marketItem, cityName, recipient);
  }

  async sendNewBugNotification(
    bug: { id: string; text: string; bugType: string },
    groupChannelId: string,
    senderName: string,
    recipient: { id: string; telegramId: string; language?: string | null }
  ) {
    if (!this.bot) return;
    await sendNewBugNotification(this.bot.api, bug, groupChannelId, senderName, recipient);
  }

  async sendTransactionNotification(transactionId: string, userId: string, isSender: boolean) {
    if (!this.bot) return;
    await sendTransactionNotificationFunc(this.bot.api, transactionId, userId, isSender);
  }

  async sendUserTeamInviteNotification(team: { id: string; name: string }, inviter: any, inviteeUserId: string) {
    if (!this.bot) return;
    await sendUserTeamInviteTelegram(this.bot.api, team, inviter, inviteeUserId);
  }

  async sendUserTeamInviteAcceptedNotification(team: { id: string; name: string }, accepter: any, ownerId: string) {
    if (!this.bot) return;
    await sendUserTeamInviteAcceptedTelegram(this.bot.api, team, accepter, ownerId);
  }

  async sendUserTeamInviteDeclinedNotification(team: { id: string; name: string }, decliner: any, ownerId: string) {
    if (!this.bot) return;
    await sendUserTeamInviteDeclinedTelegram(this.bot.api, team, decliner, ownerId);
  }

  async sendUserTeamMemberRemovedNotification(team: { id: string; name: string }, removedUserId: string) {
    if (!this.bot) return;
    await sendUserTeamMemberRemovedTelegram(this.bot.api, team, removedUserId);
  }

  async sendUserTeamMemberLeftNotification(team: { id: string; name: string }, leaver: any, ownerId: string) {
    if (!this.bot) return;
    await sendUserTeamMemberLeftTelegram(this.bot.api, team, leaver, ownerId);
  }

  async sendUserTeamDeletedNotification(teamName: string, memberUserId: string) {
    if (!this.bot) return;
    await sendUserTeamDeletedTelegram(this.bot.api, teamName, memberUserId);
  }
}

export default new TelegramNotificationService();

