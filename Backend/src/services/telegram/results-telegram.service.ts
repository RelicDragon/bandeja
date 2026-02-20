import { Api } from 'grammy';
import { InputFile } from 'grammy';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { config } from '../../config/env';
import { getAiService } from '../ai/ai.service';
import { TranslationService } from '../chat/translation.service';
import { escapeHTML, trimTextForTelegram } from './utils';
import { RankingService } from '../ranking.service';
import { getUserTimezoneFromCityId, formatDateInTimezone, convertToUserTimezone } from '../user-timezone.service';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';

const localeMap: Record<string, any> = {
  en: enUS,
  ru: ru,
  sr: sr,
  es: es,
};

function getRelativeDateLabel(date: Date | string, timezone: string, lang: string): string {
  const zonedDate = convertToUserTimezone(date, timezone);
  const now = new Date();
  const nowZoned = convertToUserTimezone(now, timezone);
  
  const dateOnly = new Date(zonedDate.getFullYear(), zonedDate.getMonth(), zonedDate.getDate());
  const todayOnly = new Date(nowZoned.getFullYear(), nowZoned.getMonth(), nowZoned.getDate());
  
  const diffTime = todayOnly.getTime() - dateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  const locale = localeMap[lang] || enUS;
  
  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays === 2) {
    return '2 days ago';
  } else {
    return format(zonedDate, 'MMM d', { locale });
  }
}

export class ResultsTelegramService {
  static checkResultsEntered(game: any): boolean {
    if (!game.rounds || game.rounds.length === 0) {
      return false;
    }

    return game.rounds.some((round: any) =>
      round.matches && round.matches.some((match: any) =>
        match.sets && match.sets.some((set: any) =>
          set.teamAScore > 0 || set.teamBScore > 0
        )
      )
    );
  }

  static async generateResultsSummary(game: any, language: string): Promise<string> {
    const ai = getAiService();
    if (!ai.isConfigured()) {
      throw new ApiError(503, 'AI service is not configured');
    }

    const playingParticipants = game.participants?.filter((p: any) => p.status === 'PLAYING') || [];
    const participantUserIds = playingParticipants.map((p: any) => p.userId).filter(Boolean);
    const cityId = game.city?.id || game.cityId;

    // Get leaderboard data for city (rank by level) and games in last 30 days
    let cityRankMap = new Map<string, number>();
    let gamesInLast30DaysMap = new Map<string, number>();

    if (cityId && participantUserIds.length > 0) {
      cityRankMap = await RankingService.getCityLeaderboardRanks(cityId);
      gamesInLast30DaysMap = await RankingService.getGamesInLast30Days(participantUserIds, cityId);
    }

    const participants = playingParticipants
      .map((p: any) => {
        const firstName = p.user?.firstName || '';
        const lastName = p.user?.lastName || '';
        const name = `${firstName} ${lastName}`.trim();
        const level = p.user?.level ? p.user.level.toFixed(2) : 'N/A';
        const socialLevel = p.user?.socialLevel ? p.user.socialLevel.toFixed(2) : 'N/A';
        const cityRank = cityRankMap.get(p.userId);
        const gamesLast30Days = gamesInLast30DaysMap.get(p.userId) || 0;
        const gender = p.user?.gender;
        
        let info = `<${name}> (level: ${level}, social level: ${socialLevel}`;
        if (gender === 'MALE' || gender === 'FEMALE') {
          info += `, gender: ${gender}`;
        }
        if (cityRank) {
          info += `, city rank: #${cityRank}`;
        }
        info += `, games in last 30 days: ${gamesLast30Days})`;
        
        return info;
      })
      .filter(Boolean)
      .join(', ') || 'Unknown players';

    let resultsText = '';
    if (game.rounds && game.rounds.length > 0) {
      const roundsText = game.rounds.map((round: any, roundIdx: number) => {
        if (!round.matches || round.matches.length === 0) return '';
        
        const matchesText = round.matches.map((match: any, matchIdx: number) => {
          const teamA = match.teams?.find((t: any) => t.teamNumber === 1);
          const teamB = match.teams?.find((t: any) => t.teamNumber === 2);
          
          const teamANames = teamA?.players?.map((p: any) => {
            const firstName = p.user?.firstName || '';
            const lastName = p.user?.lastName || '';
            return `${firstName} ${lastName}`.trim();
          }).filter(Boolean).join(' & ') || 'Team A';
          
          const teamBNames = teamB?.players?.map((p: any) => {
            const firstName = p.user?.firstName || '';
            const lastName = p.user?.lastName || '';
            return `${firstName} ${lastName}`.trim();
          }).filter(Boolean).join(' & ') || 'Team B';

          const setsText = match.sets
            ?.filter((set: any) => set.teamAScore > 0 || set.teamBScore > 0)
            .map((set: any) => `${set.teamAScore}:${set.teamBScore}`)
            .join(', ') || '';

          if (!setsText) return '';
          
          return `Match ${matchIdx + 1}: ${teamANames} vs ${teamBNames} - ${setsText}`;
        }).filter(Boolean).join('; ');
        
        if (!matchesText) return '';
        return `Round ${roundIdx + 1}: ${matchesText}`;
      }).filter(Boolean).join(' | ');
      
      resultsText = roundsText || 'No results entered';
    } else {
      resultsText = 'No results entered';
    }

    const languageCode = TranslationService.extractLanguageCode(language);
    const languageNames: Record<string, string> = {
      'en': 'English',
      'ru': 'Russian',
      'sr': 'Serbian',
      'es': 'Spanish',
    };
    const targetLanguageName = languageNames[languageCode] || 'English';

    const cityTimezone = await getUserTimezoneFromCityId(cityId);
    
    let gameDate = '';
    let gameTime = '';
    if (game.startTime) {
      gameDate = getRelativeDateLabel(game.startTime, cityTimezone, languageCode);
      gameTime = await formatDateInTimezone(game.startTime, 'HH:mm', cityTimezone, languageCode);
    }
    
    const clubName = game.court?.club?.name || game.club?.name || null;
    
    const cityName = game.city?.name || 'friends';
    const entityType = game.entityType || 'GAME';
    
    let contextInfo = '';
    if (entityType === 'BAR') {
      contextInfo = `This was a bar event where they had a great time together. `;
    } else if (entityType === 'TRAINING') {
      const trainer = ((game as any).trainerId ? game.participants?.find((p: any) => p.userId === (game as any).trainerId) : null) || game.participants?.find((p: any) => p.role === 'OWNER');
      const trainerName = trainer?.user 
        ? `${trainer.user.firstName || ''} ${trainer.user.lastName || ''}`.trim()
        : null;
      
      let trainingContext = 'This was a training session. ';
      if (trainerName) {
        trainingContext += `Trainer: ${trainerName}. `;
      }
      contextInfo = trainingContext;
    } else if (entityType === 'LEAGUE') {
      const leagueName = game.leagueSeason?.league?.name || game.parent?.leagueSeason?.league?.name;
      const seasonName = game.leagueSeason?.game?.name || game.parent?.leagueSeason?.game?.name;
      const roundNumber = game.leagueRound?.orderIndex;
      const groupName = game.leagueGroup?.name;
      
      let leagueContext = 'This game was part of a league competition. ';
      if (leagueName) {
        leagueContext += `League name: ${leagueName}. `;
      }
      if (seasonName) {
        leagueContext += `Season name: ${seasonName}. `;
      }
      if (roundNumber !== undefined && roundNumber !== null) {
        leagueContext += `Round number: ${roundNumber}. `;
      }
      if (groupName) {
        leagueContext += `Group: ${groupName}. `;
      }
      contextInfo = leagueContext;
    } else if (entityType === 'LEAGUE_SEASON') {
      const leagueName = game.leagueSeason?.league?.name;
      const seasonName = game.leagueSeason?.game?.name;
      
      let leagueContext = 'This game was part of a league season. ';
      if (leagueName) {
        leagueContext += `League name: ${leagueName}. `;
      }
      if (seasonName) {
        leagueContext += `Season name: ${seasonName}. `;
      }
      contextInfo = leagueContext;
    }
    
    let locationInfo = '';
    if (clubName) {
      locationInfo = `The game was held at ${clubName} club. `;
    }
    
    let timeInfo = '';
    if (gameDate && gameTime) {
      timeInfo = `The game took place on ${gameDate} at ${gameTime}. `;
    }
    
    let genderInfo = '';
    if (game.genderTeams === 'MEN') {
      genderInfo = "This was a men's game. ";
    } else if (game.genderTeams === 'WOMEN') {
      genderInfo = "This was a women's game. ";
    } else if (game.genderTeams === 'MIX_PAIRS') {
      genderInfo = 'This was a mixed pairs game (men and women). ';
    }
    
    const prompt = `Give me a summary of match in informal manner for a group of friends. Start your summary with "Hello, ${cityName}!" or similar greeting and proceed with the summary starting from newline. ${timeInfo}${locationInfo}${contextInfo}${genderInfo}They played Padel game. Game participants are: ${participants}. This game results are: ${resultsText}. Return strictly only the summary. Make it a little funny but still informative. Use if you want additional information about users.`;

    try {
      const summary = await ai.createCompletion({
        messages: [
          {
            role: 'system',
            content: `You are a friendly sports commentator. Write summaries in ${targetLanguageName} in an informal, fun way for a group of friends.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });
      return summary;
    } catch (error: any) {
      console.error('AI summary generation error:', error);
      throw new ApiError(503, 'Failed to generate summary. Please try again later.');
    }
  }

  static async getMainPhotoUrl(game: any): Promise<string | null> {
    if (!game.mainPhotoId) {
      return null;
    }

    const photoMessage = await prisma.chatMessage.findUnique({
      where: { id: game.mainPhotoId },
      select: { mediaUrls: true },
    });

    if (!photoMessage || !photoMessage.mediaUrls || photoMessage.mediaUrls.length === 0) {
      return null;
    }

    const url = photoMessage.mediaUrls[0];
    // Validate URL format
    if (!url || (!url.startsWith('http') && !url.startsWith('/'))) {
      return null;
    }

    return url;
  }

  static async downloadImageAsBuffer(imageUrl: string): Promise<Buffer> {
    try {
      // Ensure URL is absolute
      let fullUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        // If relative path, prepend CloudFront domain or base URL
        const cloudFrontDomain = config.aws.cloudFrontDomain;
        if (cloudFrontDomain) {
          fullUrl = `https://${cloudFrontDomain}${imageUrl}`;
        } else {
          // Fallback to frontend URL if CloudFront not configured
          fullUrl = `${config.frontendUrl}${imageUrl}`;
        }
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        const response = await fetch(fullUrl, {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to download image:', error);
      throw new ApiError(500, 'Failed to download image');
    }
  }

  static async sendResultsToTelegram(
    api: Api,
    gameId: string,
    resultsImageBuffer: Buffer,
    mainPhotoUrl: string | null,
    summaryText: string
  ): Promise<void> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        city: {
          select: {
            telegramGroupId: true,
          },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (!game.city.telegramGroupId) {
      throw new ApiError(400, 'City does not have a Telegram group configured');
    }

    const chatId = game.city.telegramGroupId;

    try {
      const resultsImageFile = new InputFile(resultsImageBuffer, 'results.jpg');

      const escapedSummary = escapeHTML(summaryText);

      if (escapedSummary.length > 1024) {
        if (mainPhotoUrl) {
          try {
            const mainPhotoBuffer = await this.downloadImageAsBuffer(mainPhotoUrl);
            const mainPhotoFile = new InputFile(mainPhotoBuffer, 'main-photo.jpg');

            await api.sendMediaGroup(chatId, [
              {
                type: 'photo',
                media: resultsImageFile,
              },
              {
                type: 'photo',
                media: mainPhotoFile,
              },
            ]);
          } catch (photoError: any) {
            console.warn('Failed to download main photo, sending results only:', photoError);
            await api.sendPhoto(chatId, resultsImageFile);
          }
        } else {
          await api.sendPhoto(chatId, resultsImageFile);
        }

        const trimmedText = trimTextForTelegram(escapedSummary, false);
        await api.sendMessage(chatId, trimmedText, {
          parse_mode: 'HTML',
        });
      } else {
        const finalCaption = escapedSummary;

        if (mainPhotoUrl) {
          try {
            const mainPhotoBuffer = await this.downloadImageAsBuffer(mainPhotoUrl);
            const mainPhotoFile = new InputFile(mainPhotoBuffer, 'main-photo.jpg');

            await api.sendMediaGroup(chatId, [
              {
                type: 'photo',
                media: resultsImageFile,
                caption: finalCaption,
                parse_mode: 'HTML',
              },
              {
                type: 'photo',
                media: mainPhotoFile,
              },
            ]);
          } catch (photoError: any) {
            console.warn('Failed to download main photo, sending results only:', photoError);
            await api.sendPhoto(chatId, resultsImageFile, {
              caption: finalCaption,
              parse_mode: 'HTML',
            });
          }
        } else {
          await api.sendPhoto(chatId, resultsImageFile, {
            caption: finalCaption,
            parse_mode: 'HTML',
          });
        }
      }

      await prisma.game.update({
        where: { id: gameId },
        data: { resultsSentToTelegram: true },
      });
    } catch (error: any) {
      console.error('Failed to send results to Telegram:', error);
      throw new ApiError(500, `Failed to send results to Telegram: ${error.message}`);
    }
  }
}
