import { Api } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { t } from '../../../utils/translations';
import { escapeMarkdown, getUserLanguageFromTelegramId, trimTextForTelegram } from '../utils';
import { buildMessageWithButtons } from '../shared/message-builder';
import { formatGameInfoForUser } from '../../shared/notification-base';

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

  const validSets = match.sets.filter((set: any) => set.teamAScore > 0 || set.teamBScore > 0);
  const totalScoreA = validSets.reduce((sum: number, set: any) => sum + set.teamAScore, 0);
  const totalScoreB = validSets.reduce((sum: number, set: any) => sum + set.teamBScore, 0);

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
      const validSets = match.sets.filter((set: any) => set.teamAScore > 0 || set.teamBScore > 0);
      if (validSets.length === 0) continue;

      const teamA = match.teams.find((t: any) => t.teamNumber === 1);
      const teamB = match.teams.find((t: any) => t.teamNumber === 2);
      
      if (!teamA || !teamB) continue;

      const isInTeamA = teamA.players.some((p: any) => p.userId === playerId);
      const isInTeamB = teamB.players.some((p: any) => p.userId === playerId);

      if (!isInTeamA && !isInTeamB) continue;

      const matchWinner = calculateMatchWinner(match);
      const totalScoreA = validSets.reduce((sum: number, set: any) => sum + set.teamAScore, 0);
      const totalScoreB = validSets.reduce((sum: number, set: any) => sum + set.teamBScore, 0);

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
  userId: string,
  isEdited: boolean = false
) {
  console.log(`[GAME RESULTS NOTIFICATION] Starting notification for user ${userId}, game ${gameId}, isEdited: ${isEdited}`);
  
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: {
        include: {
          club: true,
        },
      },
      club: true,
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
              currentCityId: true,
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
    console.log(`[GAME RESULTS NOTIFICATION] Game ${gameId} not found or has no outcomes`);
    return;
  }

  const userOutcome = game.outcomes.find((o: any) => o.userId === userId);
  if (!userOutcome) {
    console.log(`[GAME RESULTS NOTIFICATION] No outcome found for user ${userId} in game ${gameId}`);
    return;
  }

  const participant = game.participants.find((p: any) => p.userId === userId);
  if (!participant || !participant.user.telegramId || !participant.user.sendTelegramMessages) {
    console.log(`[GAME RESULTS NOTIFICATION] User ${userId} not eligible: telegramId=${participant?.user.telegramId}, sendMessages=${participant?.user.sendTelegramMessages}`);
    return;
  }
  
  console.log(`[GAME RESULTS NOTIFICATION] User ${userId} is eligible, preparing message`);
  console.log(`[GAME RESULTS NOTIFICATION] Telegram ID: ${participant.user.telegramId}`);

  const lang = await getUserLanguageFromTelegramId(participant.user.telegramId, undefined);
  const stats = calculatePlayerStats(userId, game.rounds);
  const metadata = userOutcome.metadata as any || {};
  const gameInfo = await formatGameInfoForUser(game, participant.user.currentCityId, lang);
  
  const gameName = game.name ? game.name : t(`games.gameTypes.${game.gameType}`, lang);
  const clubName = game.court?.club?.name || game.club?.name;
  
  const titleKey = isEdited ? 'telegram.gameResultsChanged' : 'telegram.gameFinished';
  let message = `🏁 *${escapeMarkdown(t(titleKey, lang))}*\n\n`;
  message += `🎮 ${escapeMarkdown(gameName)}\n`;
  
  if (clubName) {
    message += `📍 ${escapeMarkdown(t('telegram.place', lang))}: ${escapeMarkdown(clubName)}\n`;
  }
  
  message += `🕐 ${escapeMarkdown(t('telegram.time', lang))}: ${gameInfo.shortDate} ${gameInfo.startTime}\n`;
  
  if (game.entityType !== 'BAR') {
    message += `⏱️ ${escapeMarkdown(t('telegram.duration', lang))}: ${gameInfo.duration}\n`;
  }
  
  message += `\n📊 *${escapeMarkdown(t('telegram.yourResults', lang))}*\n\n`;
  
  if (userOutcome.position) {
    message += `🏆 ${escapeMarkdown(t('telegram.finalPlace', lang))}: ${userOutcome.position}\n`;
  }
  
  const levelChangeStr = userOutcome.levelChange > 0 
    ? `+${userOutcome.levelChange.toFixed(2)}`
    : userOutcome.levelChange.toFixed(2);
  message += `📊 ${escapeMarkdown(t('games.level', lang))}: ${userOutcome.levelBefore.toFixed(2)} -> ${userOutcome.levelAfter.toFixed(2)} (${levelChangeStr})\n`;
  
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

  const buttons = [[
    {
      text: t('telegram.viewGame', lang),
      url: `${config.frontendUrl}/games/${game.id}`
    }
  ]];

  const { message: finalMessage, options } = buildMessageWithButtons(message, buttons, lang);
  const trimmedMessage = trimTextForTelegram(finalMessage, false);

  try {
    console.log(`[GAME RESULTS NOTIFICATION] Sending message to telegram ID ${participant.user.telegramId}`);
    await api.sendMessage(participant.user.telegramId, trimmedMessage, options);
    console.log(`[GAME RESULTS NOTIFICATION] Message sent successfully to user ${userId}`);
  } catch (error) {
    console.error(`[GAME RESULTS NOTIFICATION] Failed to send Telegram game results notification to user ${userId}:`, error);
  }
}

