import TelegramBot from 'node-telegram-bot-api';
import prisma from '../config/database';
import { config } from '../config/env';
import { ChatType } from '@prisma/client';
import { getDateLabel, formatDate, t } from '../utils/translations';

class TelegramNotificationService {
  private bot: TelegramBot | null = null;

  initialize(bot: TelegramBot | null) {
    this.bot = bot;
  }

  private formatDuration(startTime: Date, endTime: Date, lang: string = 'en'): string {
    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    const hLabel = t('common.h', lang);
    const mLabel = t('common.m', lang);
    
    if (minutes === 0) return `${hours}${hLabel}`;
    return `${hours}${hLabel} ${minutes}${mLabel}`;
  }

  private escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  async sendGameChatNotification(message: any, game: any, sender: any) {
    if (!this.bot) return;

    const place = game.court?.club?.name || game.club?.name || 'Unknown location';
    const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
    const messageContent = message.content || '[Media]';

    const chatType = message.chatType as ChatType;
    const participants = await prisma.gameParticipant.findMany({
      where: { gameId: game.id },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            sendTelegramMessages: true,
            language: true,
          }
        }
      }
    });

    for (const participant of participants) {
      const user = participant.user;
      
      if (!user.telegramId || !user.sendTelegramMessages || user.id === sender.id) {
        continue;
      }

      let canSeeMessage = false;
      
      if (chatType === ChatType.PUBLIC) {
        canSeeMessage = true;
      } else if (chatType === ChatType.PRIVATE) {
        canSeeMessage = participant.isPlaying;
      } else if (chatType === ChatType.ADMINS) {
        canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
      }

      if (canSeeMessage) {
        try {
          const lang = user.language || 'en';
          const shortDate = getDateLabel(game.startTime, lang, false);
          const startTime = formatDate(game.startTime, 'HH:mm', lang);
          const duration = this.formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
          
          const formattedMessage = `📍 ${this.escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}\n👤 *${this.escapeMarkdown(senderName)}*: ${this.escapeMarkdown(messageContent)}`;
          
          const showGameButton = t('telegram.showGame', lang);
          const replyButton = t('telegram.reply', lang);
          
          const chatTypeChar = chatType === 'PUBLIC' ? 'P' : chatType === 'PRIVATE' ? 'V' : 'A';
          const showGameData = `sg:${game.id}:${user.id}`;
          const replyData = `rm:${message.id}:${game.id}:${chatTypeChar}`;
          
          const inlineKeyboard = {
            inline_keyboard: [[
              {
                text: showGameButton,
                callback_data: showGameData
              },
              {
                text: replyButton,
                callback_data: replyData
              }
            ]]
          };
          
          await this.bot.sendMessage(user.telegramId, formattedMessage, { 
            parse_mode: 'Markdown',
            reply_markup: inlineKeyboard
          });
        } catch (error) {
          console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
        }
      }
    }
  }

  async sendBugChatNotification(message: any, bug: any, sender: any) {
    if (!this.bot) return;

    const bugText = bug.text || 'Bug';
    const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
    const messageContent = message.content || '[Media]';

    const formattedMessage = `🐛 ${this.escapeMarkdown(bugText)}\n👤 *${this.escapeMarkdown(senderName)}*: ${this.escapeMarkdown(messageContent)}`;

    const bugCreator = await prisma.user.findUnique({
      where: { id: bug.senderId },
      select: {
        id: true,
        telegramId: true,
        sendTelegramMessages: true,
      }
    });

    if (bugCreator && bugCreator.telegramId && bugCreator.sendTelegramMessages && bugCreator.id !== sender.id) {
      try {
        await this.bot.sendMessage(bugCreator.telegramId, formattedMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Failed to send Telegram notification to bug creator ${bugCreator.id}:`, error);
      }
    }

    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { isAdmin: true },
          { isTrainer: true }
        ],
        NOT: { id: sender.id },
        telegramId: { not: null },
        sendTelegramMessages: true,
      },
      select: {
        id: true,
        telegramId: true,
      }
    });

    for (const admin of admins) {
      if (admin.telegramId && admin.id !== bugCreator?.id) {
        try {
          await this.bot.sendMessage(admin.telegramId, formattedMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Failed to send Telegram notification to admin ${admin.id}:`, error);
        }
      }
    }
  }

  async sendGameCard(gameId: string, telegramId: string, lang: string = 'en') {
    if (!this.bot) return;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        club: {
          include: {
            city: {
              select: {
                name: true,
              },
            },
          },
        },
        court: {
          include: {
            club: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!game) {
      console.error(`Game ${gameId} not found`);
      return;
    }

    const playingParticipants = game.participants.filter(p => p.isPlaying);
    const owner = game.participants.find(p => p.role === 'OWNER');
    const ownerName = owner ? `${owner.user.firstName || ''} ${owner.user.lastName || ''}`.trim() : null;

    const statusEmoji: Record<string, string> = {
      'announced': '📢',
      'ready': '✅',
      'started': '🏃',
      'finished': '🏁',
      'archived': '📦',
      'ANNOUNCED': '📢',
      'READY': '✅',
      'STARTED': '🏃',
      'FINISHED': '🏁',
      'ARCHIVED': '📦',
    };

    let statusKey = game.status.toLowerCase();
    const statusText = t(`games.status.${statusKey}`, lang);
    const statusDisplay = `${statusEmoji[game.status] || statusEmoji[statusKey] || '📅'} ${this.escapeMarkdown(statusText)}`;

    const gameTitle = game.name || (game.gameType !== 'CLASSIC' ? t(`games.gameTypes.${game.gameType}`, lang) : '');
    let header = gameTitle ? `*${this.escapeMarkdown(gameTitle)}*\n` : '';

    if (game.entityType !== 'GAME') {
      header += `🏷️ ${this.escapeMarkdown(t(`games.entityTypes.${game.entityType}`, lang))}\n`;
    }

    if (game.gameType !== 'CLASSIC') {
      header += `🎮 ${this.escapeMarkdown(t(`games.gameTypes.${game.gameType}`, lang))}\n`;
    }

    if (ownerName) {
      header += `👑 ${this.escapeMarkdown(t('games.organizer', lang))}: ${this.escapeMarkdown(ownerName)}\n`;
    }

    header += `${statusDisplay}\n`;

    if (!game.affectsRating) {
      header += `🚫 ${this.escapeMarkdown(t('games.noRating', lang))}\n`;
    }

    if (game.hasFixedTeams) {
      header += `👥 ${this.escapeMarkdown(t('games.fixedTeams', lang))}\n`;
    }

    const shortDate = getDateLabel(game.startTime, lang, false);
    const startTime = formatDate(game.startTime, 'HH:mm', lang);
    const dateTimeLine = `📅 ${this.escapeMarkdown(shortDate)} ${this.escapeMarkdown(startTime)}`;
    
    let timeLine = dateTimeLine;
    if (game.entityType !== 'BAR') {
      const endTime = formatDate(game.endTime, 'HH:mm', lang);
      const duration = this.formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
      timeLine += ` - ${this.escapeMarkdown(endTime)} (${this.escapeMarkdown(duration)})`;
    }

    const club = game.court?.club || game.club;
    const clubName = club?.name || 'Unknown location';
    let locationLine = `📍 ${this.escapeMarkdown(clubName)}`;
    
    if (game.court && !(game.entityType === 'BAR')) {
      locationLine += `\n   ${this.escapeMarkdown(game.court.name)}`;
    }

    if (game.court) {
      const bookingStatus = game.hasBookedCourt
        ? (game.entityType === 'BAR' ? t('createGame.hasBookedHall', lang) : t('createGame.hasBookedCourt', lang))
        : t('createGame.notBookedYet', lang);
      locationLine += `\n   ${this.escapeMarkdown(bookingStatus)}`;
    } else if (game.club) {
      locationLine += `\n   ${this.escapeMarkdown(t('createGame.notBookedYet', lang))}`;
    }

    let participantsLine = '';
    if (game.entityType === 'BAR') {
      participantsLine = `👥 ${this.escapeMarkdown(t('games.participants', lang))}: ${playingParticipants.length}`;
    } else {
      participantsLine = `👥 ${this.escapeMarkdown(t('games.participants', lang))}: ${playingParticipants.length}/${game.maxParticipants}`;
    }

    if (playingParticipants.length > 0) {
      const participantNames = playingParticipants
        .slice(0, 5)
        .map(p => `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim())
        .filter(Boolean)
        .join(', ');
      
      if (participantNames) {
        participantsLine += `\n   ${this.escapeMarkdown(participantNames)}`;
        if (playingParticipants.length > 5) {
          participantsLine += ` ${this.escapeMarkdown(`+${playingParticipants.length - 5} more`)}`;
        }
      }
    }

    let levelLine = '';
    if (game.entityType !== 'BAR' && game.minLevel !== null && game.minLevel !== undefined && 
        game.maxLevel !== null && game.maxLevel !== undefined) {
      levelLine = `⭐ ${this.escapeMarkdown(t('games.level', lang))}: ${game.minLevel.toFixed(1)}-${game.maxLevel.toFixed(1)}`;
    }

    let descriptionLine = '';
    if (game.description && game.description.trim()) {
      descriptionLine = `💬 ${this.escapeMarkdown(game.description)}`;
    }

    const gameUrl = `${config.frontendUrl}/games/${game.id}`;

    const message = [
      header,
      timeLine,
      locationLine,
      participantsLine,
      levelLine,
      descriptionLine,
    ].filter(Boolean).join('\n\n');

    const inlineKeyboard = {
      inline_keyboard: [[
        {
          text: t('telegram.viewGame', lang),
          url: gameUrl
        }
      ]]
    };

    try {
      await this.bot.sendMessage(telegramId, message, { 
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
        reply_markup: inlineKeyboard,
      });
    } catch (error) {
      console.error(`Failed to send game card to Telegram user ${telegramId}:`, error);
    }
  }
}

export default new TelegramNotificationService();

