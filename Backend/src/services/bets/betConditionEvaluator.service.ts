import { Bet } from '@prisma/client';

export interface BetCondition {
  type: 'PREDEFINED' | 'CUSTOM';
  predefined?: string;
  customText?: string;
  entityType: 'USER' | 'TEAM';
  entityId?: string;
  metadata?: Record<string, any>;
}

export interface BetEvaluationResult {
  won: boolean;
  reason?: string;
}

interface GameResultsData {
  rounds: Array<{
    matches: Array<{
      teams: Array<{
        id: string;
        teamNumber: number;
        playerIds: string[];
        score: number;
      }>;
      sets: Array<{
        teamAScore: number;
        teamBScore: number;
      }>;
      winnerId?: string | null;
    }>;
  }>;
  outcomes: Array<{
    userId: string;
    isWinner: boolean;
    wins: number;
    losses: number;
    ties: number;
  }>;
}

export async function evaluateBetCondition(
  bet: Bet,
  gameResults: GameResultsData
): Promise<BetEvaluationResult> {
  const condition = isBetCondition(bet.condition) ? bet.condition : null;
  if (!condition) {
    return { won: false, reason: 'Invalid condition' };
  }

  if (condition.type === 'CUSTOM') {
    return {
      won: false,
      reason: 'Custom conditions require manual review'
    };
  }

  if (condition.type === 'PREDEFINED' && condition.predefined) {
    const entityId = condition.entityId || bet.creatorId;
    return evaluatePredefinedCondition(
      condition.predefined,
      condition.entityType,
      entityId,
      gameResults
    );
  }

  return { won: false, reason: 'Unknown condition type' };
}

function isBetCondition(value: unknown): value is BetCondition {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const type = record.type;
  const entityType = record.entityType;
  if (type !== 'PREDEFINED' && type !== 'CUSTOM') return false;
  if (entityType !== 'USER' && entityType !== 'TEAM') return false;
  if ('predefined' in record && record.predefined != null && typeof record.predefined !== 'string') {
    return false;
  }
  if ('customText' in record && record.customText != null && typeof record.customText !== 'string') {
    return false;
  }
  if ('entityId' in record && record.entityId != null && typeof record.entityId !== 'string') {
    return false;
  }
  return true;
}

function evaluatePredefinedCondition(
  condition: string,
  entityType: 'USER' | 'TEAM',
  entityId: string,
  gameResults: GameResultsData
): BetEvaluationResult {
  switch (condition) {
    case 'WIN_GAME':
      return evaluateWinGame(entityId, gameResults);
    
    case 'LOSE_GAME':
      return evaluateLoseGame(entityId, gameResults);
    
    case 'WIN_MATCH':
      return evaluateWinMatch(entityId, gameResults);
    
    case 'LOSE_MATCH':
      return evaluateLoseMatch(entityId, gameResults);
    
    case 'TIE_MATCH':
      return evaluateTieMatch(entityId, gameResults);
    
    case 'WIN_SET':
      return evaluateWinSet(entityId, gameResults);
    
    case 'LOSE_SET':
      return evaluateLoseSet(entityId, gameResults);
    
    case 'STREAK_3_0':
      return evaluateStreak(entityId, gameResults, { wins: 3, losses: 0 });
    
    case 'STREAK_2_1':
      return evaluateStreak(entityId, gameResults, { wins: 2, losses: 1 });
    
    default:
      return { won: false, reason: 'Unsupported condition' };
  }
}

function evaluateWinGame(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  const outcome = gameResults.outcomes.find(o => o.userId === userId);
  if (!outcome) {
    return { won: false, reason: 'User did not participate' };
  }
  return { won: outcome.isWinner === true };
}

function evaluateLoseGame(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  const outcome = gameResults.outcomes.find(o => o.userId === userId);
  if (!outcome) {
    return { won: false, reason: 'User did not participate' };
  }
  return { won: outcome.isWinner === false };
}

function evaluateWinMatch(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const userTeam = match.teams.find(team => 
        team.playerIds.includes(userId)
      );
      
      if (userTeam && match.winnerId) {
        const won = match.winnerId === userTeam.id || 
                   (match.winnerId === 'teamA' && userTeam.teamNumber === 1) ||
                   (match.winnerId === 'teamB' && userTeam.teamNumber === 2);
        
        if (won) {
          return { won: true };
        }
      }
    }
  }
  return { won: false };
}

function evaluateLoseMatch(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const userTeam = match.teams.find(team => 
        team.playerIds.includes(userId)
      );
      
      if (userTeam && match.winnerId) {
        const lost = match.winnerId !== userTeam.id && 
                     !(match.winnerId === 'teamA' && userTeam.teamNumber === 1) &&
                     !(match.winnerId === 'teamB' && userTeam.teamNumber === 2);
        
        if (lost) {
          return { won: true };
        }
      }
    }
  }
  return { won: false };
}

function evaluateTieMatch(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const userTeam = match.teams.find(team => 
        team.playerIds.includes(userId)
      );
      
      if (userTeam && !match.winnerId) {
        return { won: true };
      }
    }
  }
  return { won: false };
}

function evaluateWinSet(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const userTeam = match.teams.find(team => 
        team.playerIds.includes(userId)
      );
      
      if (userTeam) {
        for (const set of match.sets) {
          const userWonSet = (userTeam.teamNumber === 1 && set.teamAScore > set.teamBScore) ||
                            (userTeam.teamNumber === 2 && set.teamBScore > set.teamAScore);
          
          if (userWonSet) {
            return { won: true };
          }
        }
      }
    }
  }
  return { won: false };
}

function evaluateLoseSet(userId: string, gameResults: GameResultsData): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const userTeam = match.teams.find(team => 
        team.playerIds.includes(userId)
      );
      
      if (userTeam) {
        for (const set of match.sets) {
          const userLostSet = (userTeam.teamNumber === 1 && set.teamAScore < set.teamBScore) ||
                             (userTeam.teamNumber === 2 && set.teamBScore < set.teamAScore);
          
          if (userLostSet) {
            return { won: true };
          }
        }
      }
    }
  }
  return { won: false };
}

function evaluateStreak(
  userId: string, 
  gameResults: GameResultsData,
  streak: { wins: number; losses: number }
): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const userTeam = match.teams.find(team => 
        team.playerIds.includes(userId)
      );
      
      if (userTeam) {
        let wins = 0;
        let losses = 0;
        
        for (const set of match.sets) {
          const userWon = (userTeam.teamNumber === 1 && set.teamAScore > set.teamBScore) ||
                         (userTeam.teamNumber === 2 && set.teamBScore > set.teamAScore);
          const userLost = (userTeam.teamNumber === 1 && set.teamAScore < set.teamBScore) ||
                          (userTeam.teamNumber === 2 && set.teamBScore < set.teamAScore);
          
          if (userWon) wins++;
          else if (userLost) losses++;
        }
        
        if (wins === streak.wins && losses === streak.losses) {
          return { won: true };
        }
      }
    }
  }
  return { won: false };
}
