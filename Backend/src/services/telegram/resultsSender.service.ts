import { Bot } from 'grammy';
import prisma from '../../config/database';
import { sendGameFinishedNotification } from './notifications/game-results.notification';

class TelegramResultsSenderService {
  private bot: Bot | null = null;

  initialize(bot: Bot | null) {
    this.bot = bot;
  }

  async sendGameFinished(gameId: string, isEdited: boolean = false) {
    console.log(`[TELEGRAM SENDER SERVICE] sendGameFinished called for game ${gameId}, isEdited: ${isEdited}`);
    
    if (!this.bot) {
      console.log(`[TELEGRAM SENDER SERVICE] Bot not initialized, cannot send notifications`);
      return;
    }

    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          participants: {
            where: { status: 'PLAYING' },
            include: {
              user: {
                select: {
                  id: true,
                  telegramId: true,
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

      if (!game) {
        console.log(`[TELEGRAM SENDER SERVICE] Game ${gameId} not found`);
        return;
      }
      
      if (!game.outcomes || game.outcomes.length === 0) {
        console.log(`[TELEGRAM SENDER SERVICE] Game ${gameId} has no outcomes`);
        return;
      }

      const readyParticipants = game.participants.filter((p) => p.user.telegramId);

      console.log(`[TELEGRAM SENDER SERVICE] Found ${readyParticipants.length} ready participants for game ${gameId}`);

      for (const participant of readyParticipants) {
        const hasOutcome = game.outcomes.some((o) => o.userId === participant.user.id);
        if (hasOutcome) {
          console.log(`[TELEGRAM SENDER SERVICE] Sending notification to user ${participant.user.id} for game ${gameId}`);
          await sendGameFinishedNotification(
            this.bot.api,
            gameId,
            participant.user.id,
            isEdited
          );
        } else {
          console.log(`[TELEGRAM SENDER SERVICE] User ${participant.user.id} has no outcome for game ${gameId}`);
        }
      }
      
      console.log(`[TELEGRAM SENDER SERVICE] Finished sending notifications for game ${gameId}`);
    } catch (error) {
      console.error(`[TELEGRAM SENDER SERVICE] Failed to send game finished notifications for game ${gameId}:`, error);
    }
  }
}

export default new TelegramResultsSenderService();

