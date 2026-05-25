import type { LeagueStanding } from '@/api/leagues';

export function getStandingDisplayName(standing: LeagueStanding | undefined): string {
  if (!standing) return '';
  if (standing.user) {
    return [standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ');
  }
  if (standing.leagueTeam?.players?.length) {
    return standing.leagueTeam.players
      .map((p: { user?: { firstName?: string; lastName?: string } }) =>
        [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')
      )
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

export function buildBracketSeedLabels(
  orderedParticipantIds: string[],
  standingsById: Map<string, LeagueStanding>
): Record<number, string> {
  const labels: Record<number, string> = {};
  for (let i = 0; i < orderedParticipantIds.length; i++) {
    const name = getStandingDisplayName(standingsById.get(orderedParticipantIds[i]));
    if (name) labels[i + 1] = name;
  }
  return labels;
}

export function formatSeedOptionLabel(seed: number, seedLabels?: Record<number, string>): string {
  const name = seedLabels?.[seed]?.trim();
  if (!name) return `#${seed}`;
  return `#${seed} · ${name}`;
}
