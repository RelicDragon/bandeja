import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, escapeHTML, convertMarkdownMessageToHTML } from '../utils';

interface PlayerStats {
  wins: number;
  ties: number;
  losses: number;
  scoresDelta: number;
}

function calculateMatchWinner(match: any): 'teamA' | 'teamB' | 'tie' | null {
  if (!match.sets || match.sets.length === 0) {
    return null;
  }

  if (match.winnerId) {
    const teamA = match.teams.find((t: any) => t.teamNumber === 1);
    if (match.winnerId === teamA?.id) return 'teamA';
    return 'teamB';
  }

  const totalScoreA = match.sets.reduce((sum: number, set: any) => sum + set.teamAScore, 0);
  const totalScoreB = match.sets.reduce((sum: number, set: any) => sum + set.teamBScore, 0);

  if (totalScoreA > totalScoreB) return 'teamA';
  if (totalScoreB > totalScoreA) return 'teamB';
  if (totalScoreA === totalScoreB && totalScoreA > 0) return 'tie';
  
  return null;
}

function calculatePlayerStats(
  playerId: string,
  rounds: any[]
): PlayerStats {
  const stats: PlayerStats = {
    wins: 0,
    ties: 0,
    losses: 0,
    scoresDelta: 0,
  };

  for (const round of rounds) {
    if (!round.matches || round.matches.length === 0) continue;

    for (const match of round.matches) {
      const teamA = match.teams.find((t: any) => t.teamNumber === 1);
      const teamB = match.teams.find((t: any) => t.teamNumber === 2);
      
      if (!teamA || !teamB) continue;

      const isInTeamA = teamA.players.some((p: any) => p.userId === playerId);
      const isInTeamB = teamB.players.some((p: any) => p.userId === playerId);

      if (!isInTeamA && !isInTeamB) continue;

      const matchWinner = calculateMatchWinner(match);
      const totalScoreA = match.sets.reduce((sum: number, set: any) => sum + set.teamAScore, 0);
      const totalScoreB = match.sets.reduce((sum: number, set: any) => sum + set.teamBScore, 0);

      if (isInTeamA) {
        stats.scoresDelta += (totalScoreA - totalScoreB);

        if (matchWinner === 'teamA') {
          stats.wins++;
        } else if (matchWinner === 'teamB') {
          stats.losses++;
        } else if (matchWinner === 'tie') {
          stats.ties++;
        }
      } else if (isInTeamB) {
        stats.scoresDelta += (totalScoreB - totalScoreA);

        if (matchWinner === 'teamB') {
          stats.wins++;
        } else if (matchWinner === 'teamA') {
          stats.losses++;
        } else if (matchWinner === 'tie') {
          stats.ties++;
        }
      }
    }
  }

  return stats;
}

export async function sendGameFinishedNotification(
  api: Api,
  gameId: string,
  userId: string
) {
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
              language: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      outcomes: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      rounds: {
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: true,
                },
              },
              sets: {
                orderBy: { setNumber: 'asc' },
              },
            },
          },
        },
        orderBy: { roundNumber: 'asc' },
      },
    },
  });

  if (!game || !game.outcomes || game.outcomes.length === 0) {
    return;
  }

  const userOutcome = game.outcomes.find((o: any) => o.userId === userId);
  if (!userOutcome) {
    return;
  }

  const participant = game.participants.find((p: any) => p.userId === userId);
  if (!participant || !participant.user.telegramId || !participant.user.sendTelegramMessages) {
    return;
  }

  const lang = participant.user.language || 'en';
  const stats = calculatePlayerStats(userId, game.rounds);
  const metadata = userOutcome.metadata as any || {};
  
  const userName = `${participant.user.firstName || ''} ${participant.user.lastName || ''}`.trim() || 'Player';
  const gameName = game.name || t(`games.gameTypes.${game.gameType}`, lang);
  
  let message = `🏁 *${escapeMarkdown(t('telegram.gameFinished', lang))}*\n\n`;
  message += `🎮 ${escapeMarkdown(gameName)}\n\n`;
  message += `👤 ${escapeMarkdown(userName)}\n\n`;
  
  message += `📊 *${escapeMarkdown(t('telegram.yourResults', lang))}*\n\n`;
  
  if (userOutcome.position) {
    message += `🏆 ${escapeMarkdown(t('telegram.finalPlace', lang))}: ${userOutcome.position}\n`;
  }
  
  if (userOutcome.levelChange !== 0) {
    const levelChangeStr = userOutcome.levelChange > 0 
      ? `+${userOutcome.levelChange.toFixed(2)}`
      : userOutcome.levelChange.toFixed(2);
    message += `⭐ ${escapeMarkdown(t('telegram.ratingChange', lang))}: ${levelChangeStr}\n`;
  }
  
  if (userOutcome.reliabilityChange !== 0) {
    const reliabilityChangeStr = userOutcome.reliabilityChange > 0 
      ? `+${userOutcome.reliabilityChange.toFixed(2)}`
      : userOutcome.reliabilityChange.toFixed(2);
    message += `📈 ${escapeMarkdown(t('telegram.reliabilityChange', lang))}: ${reliabilityChangeStr}\n`;
  }
  
  message += `📊 ${escapeMarkdown(t('telegram.record', lang))}: ${stats.wins}-${stats.ties}-${stats.losses}\n`;
  
  if (stats.scoresDelta !== 0) {
    const scoresDeltaStr = stats.scoresDelta > 0 
      ? `+${stats.scoresDelta}`
      : `${stats.scoresDelta}`;
    message += `🎯 ${escapeMarkdown(t('telegram.scoresDelta', lang))}: ${scoresDeltaStr}\n`;
  }
  
  if (metadata.roundsWon !== undefined) {
    message += `🔄 ${escapeMarkdown(t('telegram.roundsWon', lang))}: ${metadata.roundsWon}\n`;
  }
  
  if (metadata.matchesWon !== undefined) {
    message += `🎾 ${escapeMarkdown(t('telegram.matchesWon', lang))}: ${metadata.matchesWon}\n`;
  }
  
  if (userOutcome.pointsEarned > 0) {
    message += `💰 ${escapeMarkdown(t('telegram.pointsEarned', lang))}: ${userOutcome.pointsEarned}\n`;
  }

  const gameUrl = `${config.frontendUrl}/games/${game.id}`;
  const isLocalhost = gameUrl.includes('localhost') || gameUrl.includes('127.0.0.1');

  let parseMode: 'Markdown' | 'HTML' = 'Markdown';
  const replyMarkup: any = {};

  if (isLocalhost) {
    parseMode = 'HTML';
    message = convertMarkdownMessageToHTML(message);
    const viewGameText = escapeHTML(t('telegram.viewGame', lang));
    message += `\n\n🔗 <a href="${escapeHTML(gameUrl)}">${viewGameText}</a>`;
  } else {
    replyMarkup.inline_keyboard = [
      [
        {
          text: t('telegram.viewGame', lang),
          url: gameUrl
        }
      ]
    ];
  }

  try {
    await api.sendMessage(participant.user.telegramId, message, {
      parse_mode: parseMode,
      ...(Object.keys(replyMarkup).length > 0 ? { reply_markup: replyMarkup } : {})
    });
  } catch (error) {
    console.error(`Failed to send Telegram game results notification to user ${userId}:`, error);
  }
}

