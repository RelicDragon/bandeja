import { Middleware } from 'grammy';
import { BotContext } from '../types';
import { escapeMarkdown, getUserLanguage } from '../utils';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { getUserTimezoneFromCityId } from '../../user-timezone.service';
import { getGameInclude } from '../../game/read.service';
import { formatNewGameText } from '../../shared/notification-base';

export async function buildGamesMessage(
  city: any,
  games: any[],
  timezone: string,
  lang: string,
  maxLength?: number
): Promise<string | null> {
  const gamesWithEmptySlots = games.filter((game: any) => {
    const playingParticipants = game.participants.filter((p: any) => p.status === 'PLAYING');
    return playingParticipants.length < game.maxParticipants;
  });

  if (gamesWithEmptySlots.length === 0) {
    return null;
  }

  const header = `*${escapeMarkdown(t('telegram.availableGames', lang))}*\n\n`;
  const maxMessageLength = maxLength || 4096;

  let message = header;
  let remainingCount = 0;

  for (let i = 0; i < gamesWithEmptySlots.length; i++) {
    const game = gamesWithEmptySlots[i];
    const gameAny = game as any;
    
    const gameText = await formatNewGameText(gameAny, timezone, lang, {
      includeParticipants: true,
      includeLink: false,
      escapeMarkdown: true
    });

    let gameBlock = '';
    if (gameAny.name) {
      const lines = gameText.split('\n');
      gameBlock = `*${lines[0]}*\n${lines.slice(1).join('\n')}\n`;
    } else {
      gameBlock = gameText + '\n';
    }
    
    gameBlock += `🔗 [${escapeMarkdown(t('telegram.viewGame', lang))}](${config.frontendUrl}/games/${gameAny.id})\n\n`;

    const remainingGames = gamesWithEmptySlots.length - i - 1;
    const suffix = remainingGames > 0 ? `\n\n_... and ${remainingGames} more_` : '';
    const testMessage = message + gameBlock + suffix;
    
    if (maxLength && testMessage.length > maxMessageLength) {
      remainingCount = gamesWithEmptySlots.length - i;
      break;
    }

    message += gameBlock;
  }

  if (remainingCount > 0) {
    message += `\n\n_... and ${remainingCount} more_`;
  }

  return message;
}

export const handleGamesCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.chat) return;

  const chatId = ctx.chat.id.toString();
  const telegramLang = ctx.from?.language_code;
  const isGroupChat = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  let userLang = getUserLanguage(null, telegramLang);

  try {
    let city;

    if (isGroupChat) {
      city = await prisma.city.findFirst({
        where: {
          telegramGroupId: chatId,
          isActive: true,
        },
      });

      if (!city) {
        await ctx.reply(t('telegram.noCityConfigured', userLang) || 'This group is not configured with a city.');
        return;
      }
    } else {
      if (!ctx.telegramId) {
        await ctx.reply(t('telegram.authError', userLang));
        return;
      }

      const user = await prisma.user.findUnique({
        where: { telegramId: ctx.telegramId },
        select: {
          id: true,
          currentCityId: true,
          language: true,
        },
      });

      if (!user) {
        await ctx.reply(t('telegram.authError', userLang));
        return;
      }

      userLang = getUserLanguage(user.language, telegramLang);

      if (!user.currentCityId) {
        await ctx.reply(t('telegram.noCitySet', userLang));
        return;
      }

      city = await prisma.city.findUnique({
        where: { id: user.currentCityId },
      });

      if (!city || !city.isCorrect) {
        await ctx.reply(t('telegram.noCitySet', userLang));
        return;
      }
    }

    const timezone = await getUserTimezoneFromCityId(city.id);

    const games = await prisma.game.findMany({
      where: {
        cityId: city.id,
        status: 'ANNOUNCED',
        isPublic: true,
      },
      include: getGameInclude() as any,
      orderBy: {
        startTime: 'asc',
      },
    });

    const message = await buildGamesMessage(city, games, timezone, userLang);

    if (!message) {
      await ctx.reply(t('telegram.noAvailableGames', userLang));
      return;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error handling games command:', error);
    try {
      await ctx.reply(t('telegram.authError', userLang));
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
};

