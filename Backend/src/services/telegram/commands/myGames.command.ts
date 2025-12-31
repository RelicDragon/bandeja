import { Middleware } from 'grammy';
import { BotContext } from '../types';
import { escapeMarkdown, getUserLanguage, getUserLanguageFromTelegramId } from '../utils';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { GameReadService } from '../../game/read.service';
import { formatGameInfoForUser } from '../../shared/notification-base';

export const handleMyGamesCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.from || !ctx.lang || !ctx.telegramId) return;

  const telegramId = ctx.telegramId;

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: {
        id: true,
        currentCityId: true,
        language: true,
      },
    });

    if (!user) {
      const lang = getUserLanguage(null, ctx.from.language_code);
      await ctx.reply(t('telegram.authError', lang));
      return;
    }

    const userLang = getUserLanguage(user.language, ctx.from.language_code);

    if (!user.currentCityId) {
      await ctx.reply(t('telegram.noCitySet', userLang) || 'Please set your current city in the app first.');
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const allGames = await GameReadService.getGames({
      cityId: user.currentCityId,
      startDate: yesterday.toISOString(),
    });

    const myGames = allGames.filter((game: any) =>
      game.participants.some((p: any) => p.userId === user.id)
    );

    if (myGames.length === 0) {
      await ctx.reply(t('telegram.noMyGames', userLang) || 'You are not participating in any games.');
      return;
    }

    const statusEmoji: Record<string, string> = {
      'ANNOUNCED': '📢',
      'STARTED': '🏃',
      'FINISHED': '🏁',
      'ARCHIVED': '📦',
    };

    let message = `*${escapeMarkdown(t('telegram.myGames', userLang) || 'My Games')}*\n\n`;

    for (const game of myGames.slice(0, 10)) {
      const gameInfo = await formatGameInfoForUser(game, user.currentCityId, userLang);
      const statusKey = game.status.toLowerCase();
      const statusText = t(`games.status.${statusKey}`, userLang);
      const statusDisplay = `${statusEmoji[game.status] || '📅'} ${escapeMarkdown(statusText)}`;

      const club = game.court?.club || game.club;
      const clubName = escapeMarkdown(club?.name || 'Unknown location');
      const courtName = game.court?.name ? ` • ${escapeMarkdown(game.court.name)}` : '';

      const playingParticipants = game.participants.filter((p: any) => p.isPlaying);
      const participantsCount = game.entityType === 'BAR'
        ? `${playingParticipants.length}`
        : `${playingParticipants.length}/${game.maxParticipants}`;

      message += `${statusDisplay}\n`;
      message += `📅 ${escapeMarkdown(gameInfo.shortDate)} ${escapeMarkdown(gameInfo.startTime)}\n`;
      message += `📍 ${clubName}${courtName}\n`;
      message += `👥 ${participantsCount}\n`;

      const gameUrl = `${config.frontendUrl}/games/${game.id}`;
      message += `🔗 [${escapeMarkdown(t('telegram.viewGame', userLang))}](${gameUrl})\n\n`;
    }

    if (myGames.length > 10) {
      message += `...${escapeMarkdown(t('telegram.andMore', userLang) || 'and')} ${myGames.length - 10} ${escapeMarkdown(t('telegram.moreGames', userLang) || 'more games')}`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error handling my command:', error);
    const lang = await getUserLanguageFromTelegramId(telegramId, ctx.from?.language_code);
    await ctx.reply(t('telegram.authError', lang));
  }
};

