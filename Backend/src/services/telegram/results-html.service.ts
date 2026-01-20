import { config } from '../../config/env';

interface GameOutcome {
  id: string;
  userId: string;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  reliabilityChange: number;
  pointsEarned: number;
  position: number | null;
  isWinner: boolean;
  wins?: number;
  ties?: number;
  losses?: number;
  scoresMade?: number;
  scoresLost?: number;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
    level: number;
    gender?: string | null;
  };
}

interface Game {
  id: string;
  affectsRating: boolean;
  outcomes: GameOutcome[];
  hasFixedTeams?: boolean;
  genderTeams?: string;
}

function getAvatarUrl(avatar: string | null): string {
  if (!avatar) return '';
  if (avatar.startsWith('http')) return avatar;
  if (avatar.startsWith('/')) {
    const cloudFrontDomain = config.aws.cloudFrontDomain;
    if (cloudFrontDomain) {
      return `https://${cloudFrontDomain}${avatar}`;
    }
    return `${config.frontendUrl}${avatar}`;
  }
  return avatar;
}

function getLevelColor(level: number): string {
  const levelValue = Math.max(0, Math.min(7, level));
  if (levelValue <= 0) return '#3b82f6';
  if (levelValue <= 2) return '#22c55e';
  if (levelValue <= 3) return '#eab308';
  if (levelValue <= 4) return '#f97316';
  if (levelValue <= 5) return '#ef4444';
  if (levelValue <= 6) return '#f59e0b';
  return '#a855f7';
}

function getPositionIcon(position: number | null, isWinner: boolean): string {
  if (isWinner || position === 1) return '🏆';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return '';
}

function formatChange(change: number): string {
  return change > 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
}

function getChangeColor(change: number): string {
  if (change > 0) return '#16a34a';
  if (change < 0) return '#dc2626';
  return '#6b7280';
}

function getChangeIcon(change: number): string {
  if (change > 0) return '↑';
  if (change < 0) return '↓';
  return '';
}

function getRingColor(position: number | null, isWinner: boolean): string {
  if (isWinner || position === 1) return '#eab308';
  if (position === 2) return '#9ca3af';
  if (position === 3) return '#d97706';
  return 'transparent';
}

function getTranslations(language: string): Record<string, string> {
  const langCode = language.split('-')[0] || 'en';
  
  const translations: Record<string, Record<string, string>> = {
    en: {
      title: 'Game Results',
      doesNotAffectRating: 'This game does not affect rating',
      reliability: 'Reliability',
      games: 'Games',
      points: 'Points',
      scores: 'Scores',
    },
    ru: {
      title: 'Результаты игры',
      doesNotAffectRating: 'Эта игра не влияет на рейтинг',
      reliability: 'Надежность',
      games: 'Игры',
      points: 'Очки',
      scores: 'Счет',
    },
    sr: {
      title: 'Резултати игре',
      doesNotAffectRating: 'Ова игра не утиче на рејтинг',
      reliability: 'Поузданост',
      games: 'Игре',
      points: 'Поени',
      scores: 'Резултат',
    },
    es: {
      title: 'Resultados del juego',
      doesNotAffectRating: 'Este juego no afecta la calificación',
      reliability: 'Confiabilidad',
      games: 'Juegos',
      points: 'Puntos',
      scores: 'Puntuación',
    },
  };
  
  return translations[langCode] || translations.en;
}

export function generateResultsHTML(game: Game, language: string = 'en-US'): string {
  const t = getTranslations(language);
  const outcomes = [...game.outcomes].sort((a, b) => {
    if (a.position && b.position) return a.position - b.position;
    if (a.position && !b.position) return -1;
    if (!a.position && b.position) return 1;
    return b.pointsEarned - a.pointsEarned;
  });

  const isMixPairsWithoutFixedTeams = !game.hasFixedTeams && game.genderTeams === 'MIX_PAIRS';
  
  let groupedOutcomes: Array<{ place: number; outcomes: GameOutcome[] }> = [];
  
  if (isMixPairsWithoutFixedTeams) {
    const maleOutcomes = outcomes.filter(o => o.user?.gender === 'MALE');
    const femaleOutcomes = outcomes.filter(o => o.user?.gender === 'FEMALE');
    const maxPairs = Math.max(maleOutcomes.length, femaleOutcomes.length);
    
    for (let i = 0; i < maxPairs; i++) {
      const place = i + 1;
      const pair: GameOutcome[] = [];
      if (i < maleOutcomes.length) pair.push(maleOutcomes[i]);
      if (i < femaleOutcomes.length) pair.push(femaleOutcomes[i]);
      if (pair.length > 0) {
        groupedOutcomes.push({ place, outcomes: pair });
      }
    }
  } else {
    const placeMap = new Map<number, GameOutcome[]>();
    outcomes.forEach((outcome, index) => {
      const place = outcome.position ?? index + 1;
      if (!placeMap.has(place)) {
        placeMap.set(place, []);
      }
      placeMap.get(place)!.push(outcome);
    });
    
    placeMap.forEach((outcomes, place) => {
      groupedOutcomes.push({ place, outcomes });
    });
    
    groupedOutcomes.sort((a, b) => a.place - b.place);
  }

  const outcomeItems = groupedOutcomes.map((group) => {
    return group.outcomes.map((outcome) => {
      const avatarUrl = getAvatarUrl(outcome.user.avatar);
      const levelColor = getLevelColor(outcome.user.level);
      const ringColor = getRingColor(group.place, outcome.isWinner);
      const changeColor = getChangeColor(outcome.levelChange);
      const changeIcon = getChangeIcon(outcome.levelChange);
      const levelChangeText = formatChange(outcome.levelChange);
      const reliabilityChangeText = formatChange(outcome.reliabilityChange);
      const playerName = `${outcome.user.firstName || ''} ${outcome.user.lastName || ''}`.trim() || 'Unknown';
      const initials = `${outcome.user.firstName?.[0] || ''}${outcome.user.lastName?.[0] || ''}`.toUpperCase() || '?';
      
      const wins = outcome.wins || 0;
      const ties = outcome.ties || 0;
      const losses = outcome.losses || 0;
      const totalGames = wins + ties + losses;
      const scoresMade = outcome.scoresMade || 0;
      const scoresLost = outcome.scoresLost || 0;
      const scoresDelta = scoresMade - scoresLost;
      const scoresDeltaText = scoresDelta > 0 ? `+${scoresDelta}` : scoresDelta.toString();
      const scoresDeltaColor = getChangeColor(scoresDelta);
      const scoresDeltaIcon = getChangeIcon(scoresDelta);
      
      return `
        <div class="outcome-card" style="border-color: ${ringColor};">
          <div class="outcome-content">
            <div class="position-section">
              <span class="position-number">${group.place}</span>
            </div>
            <div class="avatar-section">
              ${avatarUrl 
                ? `<img src="${avatarUrl}" alt="${playerName}" class="avatar-image" onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if (fallback) fallback.style.display='flex';" />`
                : ''
              }
              <div class="avatar-fallback" style="background-color: ${levelColor}; ${avatarUrl ? 'display: none;' : 'display: flex;'}">
                ${initials}
              </div>
              <div class="level-badge" style="background-color: ${levelColor};">
                ${outcome.user.level.toFixed(1)}
              </div>
            </div>
            <div class="level-section">
              <div class="player-name">${playerName}</div>
              <div class="level-change" style="color: ${changeColor};">
                ${outcome.levelBefore.toFixed(2)} → ${outcome.levelAfter.toFixed(2)} 
                <span class="change-value">${changeIcon} ${levelChangeText}</span>
              </div>
              <div class="reliability-change">
                ${t.reliability}: ${reliabilityChangeText}
              </div>
            </div>
            <div class="stats-section">
              <div class="stats-row">
                <span class="stats-label">${t.games}:</span>
                <span class="stats-value">${wins}-${ties}-${losses}</span>
                <span class="stats-total">${totalGames}</span>
              </div>
              <div class="stats-row">
                <span class="stats-label">${t.points}:</span>
                <span class="stats-value">${outcome.pointsEarned}</span>
              </div>
              <div class="stats-row">
                <span class="stats-label">${t.scores}:</span>
                <span class="stats-value">${scoresMade}-${scoresLost}</span>
                <span class="stats-delta" style="color: ${scoresDeltaColor};">
                  ${scoresDeltaIcon} ${scoresDeltaText}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Game Results</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .container {
      background: white;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      max-width: 600px;
      width: 100%;
    }
    
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 8px;
    }
    
    .rating-notice {
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 12px;
      padding: 12px 16px;
      margin-bottom: 24px;
      text-align: center;
      color: #92400e;
      font-size: 14px;
    }
    
    .outcomes-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .outcome-card {
      background: white;
      border-radius: 16px;
      border: 3px solid;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      padding: 20px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .outcome-content {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
    }
    
    .position-section {
      flex-shrink: 0;
      width: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .position-icon {
      font-size: 32px;
    }
    
    .position-number {
      font-size: 28px;
      font-weight: 700;
      color: #374151;
    }
    
    .avatar-section {
      position: relative;
      flex-shrink: 0;
      width: 64px;
      height: 64px;
    }
    
    .avatar-image {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    
    .avatar-fallback {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 24px;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    
    .level-badge {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 700;
      font-size: 11px;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }
    
    .level-section {
      flex: 1;
      min-width: 0;
    }
    
    .player-name {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .level-change {
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 4px;
      color: #374151;
    }
    
    .change-value {
      font-weight: 700;
      margin-left: 4px;
    }
    
    .reliability-change {
      font-size: 13px;
      color: #6b7280;
    }
    
    .stats-section {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 140px;
      text-align: right;
    }
    
    .stats-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      font-size: 13px;
    }
    
    .stats-label {
      color: #6b7280;
      font-weight: 500;
    }
    
    .stats-value {
      color: #374151;
      font-weight: 600;
    }
    
    .stats-total {
      color: #9ca3af;
      font-size: 11px;
      font-weight: 500;
    }
    
    .stats-delta {
      font-weight: 700;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${t.title}</h1>
    </div>
    ${!game.affectsRating ? `<div class="rating-notice">${t.doesNotAffectRating}</div>` : ''}
    <div class="outcomes-list">
      ${outcomeItems}
    </div>
  </div>
</body>
</html>
  `;
}
