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
    position?: number;
  }>;
  fixedTeams?: Array<{ id: string; teamNumber: number; playerIds: string[] }>;
}

function getFixedTeamPlayerIds(entityId: string, gameResults: GameResultsData): string[] | null {
  const fixed = gameResults.fixedTeams?.find(ft => ft.id === entityId);
  return fixed ? fixed.playerIds : null;
}

function resolveEntityToUserId(entityType: 'USER' | 'TEAM', entityId: string, gameResults: GameResultsData): string | null {
  if (entityType === 'USER') return entityId;
  const playerIds = getFixedTeamPlayerIds(entityId, gameResults);
  return playerIds?.length ? playerIds[0] : null;
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
    const entityType = condition.entityType ?? 'USER';
    return evaluatePredefinedCondition(
      condition.predefined,
      entityType,
      entityId,
      gameResults,
      condition.metadata
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
  if (entityType != null && entityType !== 'USER' && entityType !== 'TEAM') return false;
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

export function getConditionUserId(condition: unknown): string | null {
  if (!isBetCondition(condition) || condition.entityType !== 'USER' || !condition.entityId) {
    return null;
  }
  return condition.entityId;
}

function evaluatePredefinedCondition(
  condition: string,
  entityType: 'USER' | 'TEAM',
  entityId: string,
  gameResults: GameResultsData,
  metadata?: Record<string, any>
): BetEvaluationResult {
  const userId = resolveEntityToUserId(entityType, entityId, gameResults);
  if (entityType === 'TEAM' && !userId) {
    return { won: false, reason: 'Fixed team not found' };
  }
  switch (condition) {
    case 'WIN_GAME':
      return userId ? evaluateWinGame(userId, gameResults) : { won: false, reason: 'Entity not found' };
    case 'LOSE_GAME':
      return userId ? evaluateLoseGame(userId, gameResults) : { won: false, reason: 'Entity not found' };
    case 'WIN_SET':
      return evaluateWinAtLeastOneSet(entityType, entityId, gameResults);
    case 'LOSE_SET':
      return evaluateLoseAllSets(entityType, entityId, gameResults);
    case 'WIN_ALL_SETS':
      return evaluateWinAllSets(entityType, entityId, gameResults);
    case 'LOSE_ALL_SETS':
      return evaluateLoseAllSets(entityType, entityId, gameResults);
    case 'TAKE_PLACE': {
      const place = metadata?.place != null ? Number(metadata.place) : NaN;
      if (!Number.isInteger(place) || place < 2) return { won: false, reason: 'Invalid place' };
      return evaluateTakePlace(entityType, entityId, place, gameResults);
    }
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

function findEntityMatchTeam(
  entityType: 'USER' | 'TEAM',
  entityId: string,
  match: GameResultsData['rounds'][0]['matches'][0],
  gameResults: GameResultsData
): { teamNumber: number; playerIds: string[] } | null {
  if (entityType === 'USER') {
    const team = match.teams.find(t => t.playerIds.includes(entityId));
    return team ? { teamNumber: team.teamNumber, playerIds: team.playerIds } : null;
  }
  const fixedIds = getFixedTeamPlayerIds(entityId, gameResults);
  if (!fixedIds?.length) return null;
  const setA = new Set(fixedIds);
  const team = match.teams.find(t => t.playerIds.length === setA.size && t.playerIds.every(id => setA.has(id)));
  return team ? { teamNumber: team.teamNumber, playerIds: team.playerIds } : null;
}

function evaluateWinAtLeastOneSet(entityType: 'USER' | 'TEAM', entityId: string, gameResults: GameResultsData): BetEvaluationResult {
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const entityTeam = findEntityMatchTeam(entityType, entityId, match, gameResults);
      if (entityTeam) {
        for (const set of match.sets) {
          const wonSet = (entityTeam.teamNumber === 1 && set.teamAScore > set.teamBScore) ||
            (entityTeam.teamNumber === 2 && set.teamBScore > set.teamAScore);
          if (wonSet) return { won: true };
        }
      }
    }
  }
  return { won: false };
}

function evaluateLoseAllSets(entityType: 'USER' | 'TEAM', entityId: string, gameResults: GameResultsData): BetEvaluationResult {
  let playedAnySet = false;
  let wonAnySet = false;
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const entityTeam = findEntityMatchTeam(entityType, entityId, match, gameResults);
      if (entityTeam) {
        for (const set of match.sets) {
          playedAnySet = true;
          const wonSet = (entityTeam.teamNumber === 1 && set.teamAScore > set.teamBScore) ||
            (entityTeam.teamNumber === 2 && set.teamBScore > set.teamAScore);
          if (wonSet) wonAnySet = true;
        }
      }
    }
  }
  return { won: playedAnySet && !wonAnySet };
}

function evaluateWinAllSets(entityType: 'USER' | 'TEAM', entityId: string, gameResults: GameResultsData): BetEvaluationResult {
  let playedAnySet = false;
  let lostAnySet = false;
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      const entityTeam = findEntityMatchTeam(entityType, entityId, match, gameResults);
      if (entityTeam) {
        for (const set of match.sets) {
          playedAnySet = true;
          const lostSet = (entityTeam.teamNumber === 1 && set.teamAScore < set.teamBScore) ||
            (entityTeam.teamNumber === 2 && set.teamBScore < set.teamAScore);
          if (lostSet) lostAnySet = true;
        }
      }
    }
  }
  return { won: playedAnySet && !lostAnySet };
}

function evaluateTakePlace(
  entityType: 'USER' | 'TEAM',
  entityId: string,
  place: number,
  gameResults: GameResultsData
): BetEvaluationResult {
  if (entityType === 'USER') {
    const outcome = gameResults.outcomes.find(o => o.userId === entityId);
    if (!outcome) return { won: false, reason: 'Entity not in outcomes' };
    if (outcome.position != null && Number.isInteger(outcome.position)) {
      return { won: outcome.position === place };
    }
    const sorted = [...gameResults.outcomes].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.ties !== a.ties) return b.ties - a.ties;
      return a.userId.localeCompare(b.userId);
    });
    const idx = sorted.findIndex(o => o.userId === entityId);
    const actualPlace = idx + 1;
    return { won: actualPlace === place };
  }
  const fixedPlayerIds = getFixedTeamPlayerIds(entityId, gameResults);
  if (fixedPlayerIds?.length) {
    const outcome = gameResults.outcomes.find(o => fixedPlayerIds.includes(o.userId));
    if (!outcome) return { won: false, reason: 'Fixed team not in outcomes' };
    if (outcome.position != null && Number.isInteger(outcome.position)) {
      return { won: outcome.position === place };
    }
    const sorted = [...gameResults.outcomes].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.ties !== a.ties) return b.ties - a.ties;
      return a.userId.localeCompare(b.userId);
    });
    const idx = sorted.findIndex(o => fixedPlayerIds.includes(o.userId));
    const actualPlace = idx + 1;
    return { won: actualPlace === place };
  }
  const teamWins: Record<string, number> = {};
  for (const round of gameResults.rounds) {
    for (const match of round.matches) {
      for (const team of match.teams) {
        const tid = team.id;
        if (!(tid in teamWins)) teamWins[tid] = 0;
        const won = match.winnerId === tid ||
          (match.winnerId === 'teamA' && team.teamNumber === 1) ||
          (match.winnerId === 'teamB' && team.teamNumber === 2);
        if (won) teamWins[team.id]++;
      }
    }
  }
  const sortedTeams = Object.entries(teamWins)
    .sort(([idA, a], [idB, b]) => b !== a ? b - a : idA.localeCompare(idB))
    .map(([id]) => id);
  const idx = sortedTeams.indexOf(entityId);
  if (idx < 0) return { won: false, reason: 'Team not in results' };
  const actualPlace = idx + 1;
  return { won: actualPlace === place };
}
