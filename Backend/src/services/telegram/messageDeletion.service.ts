import { Bot } from 'grammy';

export function scheduleMessageDeletion(chatId: number, messageId: number, bot: Bot | null) {
  setTimeout(async () => {
    try {
      if (bot) {
        await bot.api.deleteMessage(chatId, messageId);
      }
    } catch (error) {
      console.log('Could not delete notification message:', error);
    }
  }, 20000);
}

