import { Sports, DEFAULT_SPORT, parseSport, type Sport } from '@shared/sport';
import type { BasicUser } from '@/types';

export type InviteSportFilterValue = 'game' | 'all' | Sport;

export function normalizeInviteSportFilter(
  value: InviteSportFilterValue | undefined,
): InviteSportFilterValue {
  if (value === undefined || value === 'game') return 'game';
  if (value === 'all') return 'all';
  return value;
}

export function isInviteSportFilterActive(
  filter: InviteSportFilterValue | undefined,
): boolean {
  return normalizeInviteSportFilter(filter) !== 'game';
}

export function resolveInviteSportFilterTarget(
  filter: InviteSportFilterValue | undefined,
  gameSport: Sport,
): Sport | null {
  const f = normalizeInviteSportFilter(filter);
  if (f === 'all') return null;
  if (f === 'game') return gameSport;
  return f;
}

export function invitableUserPlaysSport(
  player: Pick<BasicUser, 'sportsEnabled' | 'primarySport'>,
  sport: Sport,
): boolean {
  const enabled = player.sportsEnabled;
  if (enabled === undefined || enabled === null) {
    return sport === parseSport(player.primarySport, DEFAULT_SPORT);
  }
  if (enabled.length === 0) return sport === Sports.PADEL;
  return enabled.includes(sport);
}

export function passesInviteSportFilter(
  player: Pick<BasicUser, 'sportsEnabled' | 'primarySport'>,
  filter: InviteSportFilterValue | undefined,
  gameSport: Sport,
): boolean {
  const target = resolveInviteSportFilterTarget(filter, gameSport);
  if (!target) return true;
  return invitableUserPlaysSport(player, target);
}
