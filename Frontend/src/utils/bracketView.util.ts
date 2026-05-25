import type {
  BracketPlayoffGroupDto,
  BracketPlayoffResponse,
  BracketScope,
  LeagueRound,
} from '@/api/leagues';

export type { BracketScope };

export function bracketScopeFromPayload(payload: BracketPlayoffResponse | null | undefined): BracketScope {
  return payload?.round?.bracketScope ?? 'PER_GROUP';
}

export function isCrossGroupBracket(payload: BracketPlayoffResponse | null | undefined): boolean {
  return bracketScopeFromPayload(payload) === 'CROSS_GROUP';
}

export function isCrossGroupBracketRound(round: LeagueRound | null | undefined): boolean {
  return round?.playoffFormat === 'BRACKET' && round?.bracketScope === 'CROSS_GROUP';
}

export function shouldPromptBracketGroupSelection(
  payload: BracketPlayoffResponse | null | undefined,
  options?: { selectedGroupId?: string; allGroupId?: string }
): boolean {
  if (!payload?.groups?.length || isCrossGroupBracket(payload)) return false;
  const allGroupId = options?.allGroupId ?? 'ALL';
  const selectedGroupId = options?.selectedGroupId ?? allGroupId;
  return selectedGroupId === allGroupId && payload.groups.length > 1;
}

export function getActiveBracketGroup(
  payload: BracketPlayoffResponse | null | undefined,
  options?: { selectedGroupId?: string; allGroupId?: string }
): BracketPlayoffGroupDto | null {
  if (!payload?.groups?.length) return null;
  if (isCrossGroupBracket(payload)) return payload.groups[0] ?? null;
  if (shouldPromptBracketGroupSelection(payload, options)) return null;
  const allGroupId = options?.allGroupId ?? 'ALL';
  const selectedGroupId = options?.selectedGroupId;
  if (selectedGroupId && selectedGroupId !== allGroupId) {
    return payload.groups.find((g) => g.leagueGroupId === selectedGroupId) ?? null;
  }
  return payload.groups[0] ?? null;
}

export function resolveBracketGroupFromQuery(
  payload: BracketPlayoffResponse | null | undefined,
  groupFromQuery: string | null
): BracketPlayoffGroupDto | null {
  if (!payload?.groups?.length) return null;
  if (isCrossGroupBracket(payload)) return payload.groups[0] ?? null;
  if (groupFromQuery) {
    const hit = payload.groups.find((g) => g.leagueGroupId === groupFromQuery);
    if (hit) return hit;
  }
  return payload.groups[0] ?? null;
}
