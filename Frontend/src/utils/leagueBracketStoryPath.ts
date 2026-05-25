export type BracketChampionStoryBracket = {
  leagueSeasonId: string;
  leagueRoundId: string;
  leagueGroupId: string | null;
  bracketScope: 'PER_GROUP' | 'CROSS_GROUP';
};

export function buildLeagueBracketStoryPath(bracket: BracketChampionStoryBracket): string {
  const params = new URLSearchParams();
  params.set('tab', 'schedule');
  params.set('subtab', 'bracket');
  if (bracket.bracketScope === 'PER_GROUP' && bracket.leagueGroupId) {
    params.set('group', bracket.leagueGroupId);
  }
  return `/games/${bracket.leagueSeasonId}?${params.toString()}`;
}
