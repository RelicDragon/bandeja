import { Sport } from '@prisma/client';
import { format } from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';
import { cs } from 'date-fns/locale/cs';
import { RankingService } from '../ranking.service';
import { resolveUserSportSnapshot } from '../user/userSportProfile.service';
import { formatSportLabel } from '../shared/notificationSport';
import { TranslationService } from '../chat/translation.service';
import { getUserTimezoneFromCityId, formatDateInTimezone, convertToUserTimezone } from '../user-timezone.service';

const localeMap: Record<string, typeof enGB> = {
  en: enGB,
  ru,
  sr,
  es,
  cs,
};

function getRelativeDateLabel(date: Date | string, timezone: string, lang: string): string {
  const zonedDate = convertToUserTimezone(date, timezone);
  const now = new Date();
  const nowZoned = convertToUserTimezone(now, timezone);

  const dateOnly = new Date(zonedDate.getFullYear(), zonedDate.getMonth(), zonedDate.getDate());
  const todayOnly = new Date(nowZoned.getFullYear(), nowZoned.getMonth(), nowZoned.getDate());

  const diffTime = todayOnly.getTime() - dateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const base = (lang || 'en').split('-')[0].toLowerCase();
  const locale = localeMap[base] || enGB;

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays === 2) return '2 days ago';
  return format(zonedDate, 'MMM d', { locale });
}

export async function buildResultsSummaryPrompt(
  game: any,
  language: string
): Promise<string> {
  const gameSport: Sport = game.sport ?? Sport.PADEL;
  const playingParticipants = game.participants?.filter((p: any) => p.status === 'PLAYING') || [];
  const participantUserIds = playingParticipants.map((p: any) => p.userId).filter(Boolean);
  const cityId = game.city?.id || game.cityId;

  let cityRankMap = new Map<string, number>();
  let gamesInLast30DaysMap = new Map<string, number>();

  if (cityId && participantUserIds.length > 0) {
    cityRankMap = await RankingService.getCityLeaderboardRanks(cityId, gameSport);
    gamesInLast30DaysMap = await RankingService.getGamesInLast30Days(
      participantUserIds,
      cityId,
      gameSport
    );
  }

  const participants =
    playingParticipants
      .map((p: any) => {
        const firstName = p.user?.firstName || '';
        const lastName = p.user?.lastName || '';
        const name = `${firstName} ${lastName}`.trim();
        const sportSnapshot = p.user ? resolveUserSportSnapshot(p.user, gameSport) : null;
        const level = sportSnapshot != null ? sportSnapshot.level.toFixed(2) : 'N/A';
        const reliability =
          sportSnapshot != null ? sportSnapshot.reliability.toFixed(2) : 'N/A';
        const sportRecord =
          sportSnapshot != null
            ? `${sportSnapshot.gamesWon}-${sportSnapshot.gamesPlayed - sportSnapshot.gamesWon} in ${sportSnapshot.gamesPlayed} rated games`
            : 'N/A';
        const socialLevel = p.user?.socialLevel ? p.user.socialLevel.toFixed(2) : 'N/A';
        const cityRank = cityRankMap.get(p.userId);
        const gamesLast30Days = gamesInLast30DaysMap.get(p.userId) || 0;
        const gender = p.user?.gender;

        let info = `<${name}> (level: ${level}, reliability: ${reliability}, sport record W-L: ${sportRecord}, social level: ${socialLevel}`;
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
    const roundsText = game.rounds
      .map((round: any, roundIdx: number) => {
        if (!round.matches || round.matches.length === 0) return '';

        const matchesText = round.matches
          .map((match: any, matchIdx: number) => {
            const teamA = match.teams?.find((t: any) => t.teamNumber === 1);
            const teamB = match.teams?.find((t: any) => t.teamNumber === 2);

            const teamANames =
              teamA?.players
                ?.map((p: any) => {
                  const firstName = p.user?.firstName || '';
                  const lastName = p.user?.lastName || '';
                  return `${firstName} ${lastName}`.trim();
                })
                .filter(Boolean)
                .join(' & ') || 'Team A';

            const teamBNames =
              teamB?.players
                ?.map((p: any) => {
                  const firstName = p.user?.firstName || '';
                  const lastName = p.user?.lastName || '';
                  return `${firstName} ${lastName}`.trim();
                })
                .filter(Boolean)
                .join(' & ') || 'Team B';

            const setsText =
              match.sets
                ?.filter((set: any) => set.teamAScore > 0 || set.teamBScore > 0)
                .map((set: any) => {
                  const base = `${set.teamAScore}:${set.teamBScore}`;
                  if (set.role === 'EXTRA_GAMES') return `${base} (extra games · stats only)`;
                  if (set.role === 'EXTRA_BALLS') return `${base} (extra balls · stats only)`;
                  return base;
                })
                .join(', ') || '';

            if (!setsText) return '';
            return `Match ${matchIdx + 1}: ${teamANames} vs ${teamBNames} - ${setsText}`;
          })
          .filter(Boolean)
          .join('; ');

        if (!matchesText) return '';
        return `Round ${roundIdx + 1}: ${matchesText}`;
      })
      .filter(Boolean)
      .join(' | ');

    resultsText = roundsText || 'No results entered';
  } else {
    resultsText = 'No results entered';
  }

  const languageCode = TranslationService.extractLanguageCode(language);
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
    contextInfo = 'This was a bar event where they had a great time together. ';
  } else if (entityType === 'TRAINING') {
    const trainer =
      ((game as any).trainerId
        ? game.participants?.find((p: any) => p.userId === (game as any).trainerId)
        : null) || game.participants?.find((p: any) => p.role === 'OWNER');
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
    if (leagueName) leagueContext += `League name: ${leagueName}. `;
    if (seasonName) leagueContext += `Season name: ${seasonName}. `;
    if (roundNumber !== undefined && roundNumber !== null) {
      leagueContext += `Round number: ${roundNumber}. `;
    }
    if (groupName) leagueContext += `Group: ${groupName}. `;
    contextInfo = leagueContext;
  } else if (entityType === 'LEAGUE_SEASON') {
    const leagueName = game.leagueSeason?.league?.name;
    const seasonName = game.leagueSeason?.game?.name;

    let leagueContext = 'This game was part of a league season. ';
    if (leagueName) leagueContext += `League name: ${leagueName}. `;
    if (seasonName) leagueContext += `Season name: ${seasonName}. `;
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

  const sportLabel = formatSportLabel(gameSport, languageCode);
  return `Give me a summary of match in informal manner for a group of friends. Start your summary with "Hello, ${cityName}!" or similar greeting and proceed with the summary starting from newline. ${timeInfo}${locationInfo}${contextInfo}${genderInfo}They played a ${sportLabel} game. Game participants are: ${participants}. This game results are: ${resultsText}. Return strictly only the summary. Make it a little funny but still informative. Use if you want additional information about users.`;
}
