import { Bot } from 'grammy';
import prisma from '../../config/database';
import { sendGameFinishedNotification } from './notifications/game-results.notification';

class TelegramResultsSenderService {
  private bot: Bot | null = null;

  initialize(bot: Bot | null) {
    this.bot = bot;
  }

  async sendGameFinished(gameId: string) {
    if (!this.bot) return;

    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          participants: {
            where: { isPlaying: true },
            include: {
              user: {
                select: {
                  id: true,
                  telegramId: true,
                  sendTelegramMessages: true,
                },
              },
            },
          },
          outcomes: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!game || !game.outcomes || game.outcomes.length === 0) {
        return;
      }

      const readyParticipants = game.participants.filter(
        (p) => p.user.telegramId && p.user.sendTelegramMessages
      );

      for (const participant of readyParticipants) {
        const hasOutcome = game.outcomes.some((o) => o.userId === participant.user.id);
        if (hasOutcome) {
          await sendGameFinishedNotification(
            this.bot.api,
            gameId,
            participant.user.id
          );
        }
      }
    } catch (error) {
      console.error(`Failed to send game finished notifications for game ${gameId}:`, error);
    }
  }
}

export default new TelegramResultsSenderService();

