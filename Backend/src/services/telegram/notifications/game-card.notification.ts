import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, escapeHTML, convertMarkdownMessageToHTML, formatDuration } from '../utils';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';

export async function sendGameCard(
  api: Api,
  gameId: string,
  telegramId: string,
  lang: string = 'en'
) {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: {
      currentCityId: true,
      language: true,
    },
  });

  const userLang = user?.language || lang;
  const timezone = await getUserTimezoneFromCityId(user?.currentCityId || null);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      club: {
        include: {
          city: {
            select: {
              name: true,
              country: true,
            },
          },
        },
      },
      court: {
        include: {
          club: {
            include: {
              city: {
                select: {
                  name: true,
                  country: true,
                },
              },
            },
          },
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
  }) as any;

  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }

  const playingParticipants = game.participants.filter((p: any) => p.isPlaying);
  const owner = game.participants.find((p: any) => p.role === 'OWNER');
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

  const divider = '--------------------------------';
  
  let statusKey = game.status.toLowerCase();
  const statusText = t(`games.status.${statusKey}`, userLang);
  const statusDisplay = `${statusEmoji[game.status] || statusEmoji[statusKey] || '📅'} ${escapeMarkdown(statusText)}`;

  const gameTitle = game.name || (game.gameType !== 'CLASSIC' ? t(`games.gameTypes.${game.gameType}`, userLang) : '');
  let header = gameTitle ? `*${escapeMarkdown(gameTitle)}*\n` : '';

  if (game.entityType !== 'GAME') {
    header += `🏷️ ${escapeMarkdown(t(`games.entityTypes.${game.entityType}`, userLang))}\n`;
  }

  if (game.gameType !== 'CLASSIC') {
    header += `🎮 ${escapeMarkdown(t(`games.gameTypes.${game.gameType}`, userLang))}\n`;
  }

  if (ownerName) {
    header += `👑 ${escapeMarkdown(t('games.organizer', userLang))}: ${escapeMarkdown(ownerName)}\n`;
  }

  header += `${statusDisplay}\n`;

  if (!game.affectsRating) {
    header += `🚫 ${escapeMarkdown(t('games.noRating', userLang))}\n`;
  }

  if (game.hasFixedTeams) {
    header += `👥 ${escapeMarkdown(t('games.fixedTeams', userLang))}\n`;
  }

  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, userLang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, userLang);
  const dateTimeLine = `📅 ${escapeMarkdown(shortDate)} ${escapeMarkdown(startTime)}`;
  
  let timeLine = dateTimeLine;
  if (game.entityType !== 'BAR') {
    const endTime = await formatDateInTimezone(game.endTime, 'HH:mm', timezone, userLang);
    const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), userLang);
    timeLine += ` - ${escapeMarkdown(endTime)} (${escapeMarkdown(duration)})`;
  }

  const club = game.court?.club || game.club;
  const clubName = club?.name || 'Unknown location';
  let locationLine = `📍 ${escapeMarkdown(clubName)}`;
  
  if (game.court && !(game.entityType === 'BAR')) {
    locationLine += `\n   ${escapeMarkdown(game.court.name)}`;
  }

  if (game.court) {
    const bookingStatus = game.hasBookedCourt
      ? (game.entityType === 'BAR' ? t('createGame.hasBookedHall', userLang) : t('createGame.hasBookedCourt', userLang))
      : t('createGame.notBookedYet', userLang);
    locationLine += `\n   ${escapeMarkdown(bookingStatus)}`;
  } else if (game.club) {
    locationLine += `\n   ${escapeMarkdown(t('createGame.notBookedYet', userLang))}`;
  }

  let participantsLine = '';
  if (game.entityType === 'BAR') {
    participantsLine = `👥 ${escapeMarkdown(t('games.participants', userLang))}: ${playingParticipants.length}`;
  } else {
    participantsLine = `👥 ${escapeMarkdown(t('games.participants', userLang))}: ${playingParticipants.length}/${game.maxParticipants}`;
  }

  if (playingParticipants.length > 0) {
    const participantNames = playingParticipants
      .slice(0, 5)
      .map((p: any) => `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim())
      .filter(Boolean)
      .join(', ');
    
    if (participantNames) {
      participantsLine += `\n   ${escapeMarkdown(participantNames)}`;
      if (playingParticipants.length > 5) {
        participantsLine += ` ${escapeMarkdown(`+${playingParticipants.length - 5} more`)}`;
      }
    }
  }

  let levelLine = '';
  if (game.entityType !== 'BAR' && game.minLevel !== null && game.minLevel !== undefined && 
      game.maxLevel !== null && game.maxLevel !== undefined) {
    levelLine = `⭐ ${escapeMarkdown(t('games.level', userLang))}: ${game.minLevel.toFixed(1)}-${game.maxLevel.toFixed(1)}`;
  }

  let descriptionLine = '';
  if (game.description && game.description.trim()) {
    descriptionLine = `💬 ${escapeMarkdown(game.description)}`;
  }

  const gameUrl = `${config.frontendUrl}/games/${game.id}`;
  const isLocalhost = gameUrl.includes('localhost') || gameUrl.includes('127.0.0.1');

  let navigationUrl: string | null = null;
  if (club && club.city) {
    const destinationParts = [club.city.country, club.city.name, club.address].filter(Boolean);
    if (destinationParts.length > 0) {
      const destination = encodeURIComponent(destinationParts.join('+'));
      navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    }
  }

  let message = [
    divider,
    header,
    timeLine,
    locationLine,
    participantsLine,
    levelLine,
    descriptionLine,
  ].filter(Boolean).join('\n\n');

  const replyMarkup: any = {};
  let parseMode: 'Markdown' | 'HTML' = 'Markdown';

  if (isLocalhost) {
    parseMode = 'HTML';
    message = convertMarkdownMessageToHTML(message);
    const viewGameText = escapeHTML(t('telegram.viewGame', userLang));
    message += `\n\n🔗 <a href="${escapeHTML(gameUrl)}">${viewGameText}</a>`;
    if (navigationUrl) {
      const navigateText = escapeHTML(t('telegram.navigateToClub', userLang));
      message += `\n🗺️ <a href="${escapeHTML(navigationUrl)}">${navigateText}</a>`;
    }
  } else {
    const buttons = [
      {
        text: t('telegram.viewGame', userLang),
        url: gameUrl
      }
    ];
    if (navigationUrl) {
      buttons.push({
        text: t('telegram.navigateToClub', userLang),
        url: navigationUrl
      });
    }
    replyMarkup.inline_keyboard = [buttons];
  }

  await api.sendMessage(telegramId, message, { 
    parse_mode: parseMode,
    ...(Object.keys(replyMarkup).length > 0 ? { reply_markup: replyMarkup } : {})
  });
}

