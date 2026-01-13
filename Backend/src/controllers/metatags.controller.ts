import { Request, Response } from 'express';
import { GameReadService } from '../services/game/game.service';
import { formatInTimeZone } from 'date-fns-tz';
import { config } from '../config/env';

const generateGameMetaTags = (game: any): string => {
  const location = game.location || 
                   (game.court?.club?.name) || 
                   (game.club?.name) || 
                   'Location TBD';
  
  let datetime = 'Date TBD';
  if (game.startTime) {
    const startDate = new Date(game.startTime);
    
    if (game.timeIsSet) {
      const startStr = formatInTimeZone(startDate, 'Europe/Belgrade', 'EEE, dd MMM yyyy HH:mm');
      if (game.endTime) {
        const endDate = new Date(game.endTime);
        const endStr = formatInTimeZone(endDate, 'Europe/Belgrade', 'HH:mm');
        datetime = `${startStr} - ${endStr}`;
      } else {
        datetime = startStr;
      }
    } else {
      const dateStr = formatInTimeZone(startDate, 'Europe/Belgrade', 'EEE, dd MMM yyyy');
      datetime = dateStr;
    }
  }
  
  const gameType = game.entityType === 'TRAINING' ? 'Training' : 
                   game.entityType === 'LEAGUE' ? 'League' : 
                   game.entityType === 'LEAGUE_SEASON' ? 'League Season' : 
                   game.entityType === 'BAR' ? 'Bar Event' : 
                   'Game';
  
  const owner = game.participants?.find((p: any) => p.role === 'OWNER')?.user;
  const creatorName = owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() : null;
  
  const levelInfo = [];
  if (game.minLevel) levelInfo.push(`Level ${game.minLevel}`);
  if (game.maxLevel) {
    if (game.minLevel && game.minLevel !== game.maxLevel) {
      levelInfo[0] = `Level ${game.minLevel}-${game.maxLevel}`;
    } else if (!game.minLevel) {
      levelInfo.push(`Level up to ${game.maxLevel}`);
    }
  }
  
  const details = [];
  details.push(location);
  details.push(datetime);
  if (levelInfo.length > 0) details.push(levelInfo.join(' '));
  if (game.maxParticipants) details.push(`${game.maxParticipants} players`);
  if (creatorName) details.push(`by ${creatorName}`);
  
  const title = game.name || `Join the ${gameType}!`;
  const description = details.join(', ');
  
  const imageUrl = game.avatar || 
                   game.court?.club?.photos?.[0] || 
                   game.club?.photos?.[0] || 
                   `${config.frontendUrl}/bandeja-blue-flat-small.png`;
  
  const pageUrl = `${config.frontendUrl}/games/${game.id}`;
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/favicon/favicon.svg" />
    <link rel="shortcut icon" href="/favicon/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-title" content="Bandeja" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#000000" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Bandeja Padel">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:locale" content="en_US">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    
    <meta name="description" content="${description}" />
    
    <link rel="manifest" href="/manifest.json" />
    <title>${title} - Bandeja Padel</title>
  </head>
  <body>
    <h1>${title}</h1>
    <p>${description}</p>
    <p><a href="${pageUrl}">View Game</a></p>
  </body>
</html>`;
};

export const getGameMetaTags = async (req: Request, res: Response) => {
  try {
    const { gameId } = req.params;
    
    const game = await GameReadService.getGameById(gameId, undefined, true);
    
    const html = generateGameMetaTags(game);
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error: any) {
    const fallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bandeja Padel</title>
  </head>
  <body>
    <h1>Game not found</h1>
    <p><a href="${config.frontendUrl}">Go to Homepage</a></p>
  </body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(fallbackHtml);
  }
};
