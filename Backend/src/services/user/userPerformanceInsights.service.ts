import { EntityType, ParticipantStatus, Sport } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  USER_SELECT_FIELDS,
  USER_SPORT_PROFILE_SELECT,
} from '../../utils/constants';
import { projectUserForSportContext } from './userSportProfile.service';
import { isOfficialMatchSetRole } from '../results/matchSetRole';
import { isPrismaMatchCountedForStandingsAndRating } from '../results/matchStandingsPrisma';

const INSIGHT_USER_SELECT = {
  ...USER_SELECT_FIELDS,
  sportsEnabled: true,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

type InsightUser = Prisma.UserGetPayload<{ select: typeof INSIGHT_USER_SELECT }>;
type PerformanceRelationshipUser = Omit<InsightUser, 'sportProfiles'> & {
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
};

export type StreakResult = 'win' | 'loss' | 'tie';

export interface StreakOutcomeInput {
  isWinner: boolean;
  wins: number;
  ties: number;
  losses: number;
  createdAt: Date | string;
}

export interface PerformanceStreaks {
  recentGames: StreakResult[];
  current: {
    result: StreakResult;
    count: number;
  } | null;
  longestWin: number;
  longestLoss: number;
}

export interface PerformanceRelationshipEntry {
  user: PerformanceRelationshipUser;
  wins: number;
  losses: number;
  ties: number;
  totalMatches: number;
  winRate: string;
}

export interface PerformanceRelationships {
  bestPartner: PerformanceRelationshipEntry | null;
  worstPartner: PerformanceRelationshipEntry | null;
  bestPartnerByCount: PerformanceRelationshipEntry | null;
  worstPartnerByCount: PerformanceRelationshipEntry | null;
  favoriteTarget: PerformanceRelationshipEntry | null;
  nemesis: PerformanceRelationshipEntry | null;
}

export interface UserPerformanceInsights {
  streaks: PerformanceStreaks;
  relationships: PerformanceRelationships;
}

interface RelationshipCounter {
  user: InsightUser;
  wins: number;
  losses: number;
  ties: number;
}

export interface RelationshipMatchInput<TUser = InsightUser> {
  winnerTeamId: string | null;
  teams: Array<{
    id: string;
    players: Array<{
      userId: string;
      user: TUser;
    }>;
  }>;
}

function compareName(a: InsightUser, b: InsightUser): number {
  const aName = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().toLocaleLowerCase();
  const bName = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim().toLocaleLowerCase();
  return aName.localeCompare(bName);
}

function winRate(entry: Pick<RelationshipCounter, 'wins' | 'losses' | 'ties'>): number {
  const total = entry.wins + entry.losses + entry.ties;
  return total > 0 ? entry.wins / total : 0;
}

function toRelationshipEntry(
  entry: RelationshipCounter | null,
  sport: Sport,
): PerformanceRelationshipEntry | null {
  if (!entry) return null;
  const totalMatches = entry.wins + entry.losses + entry.ties;
  if (totalMatches === 0) return null;
  return {
    user: projectUserForSportContext(entry.user, sport),
    wins: entry.wins,
    losses: entry.losses,
    ties: entry.ties,
    totalMatches,
    winRate: ((entry.wins / totalMatches) * 100).toFixed(1),
  };
}

export function resolveStreakResult(outcome: Pick<StreakOutcomeInput, 'isWinner' | 'wins' | 'ties' | 'losses'>): StreakResult {
  if (outcome.isWinner) return 'win';
  if (outcome.ties > outcome.wins && outcome.ties >= outcome.losses) return 'tie';
  return 'loss';
}

export function buildPerformanceStreaks(outcomes: StreakOutcomeInput[]): PerformanceStreaks {
  const ordered = [...outcomes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const results = ordered.map(resolveStreakResult);
  const recentGames = results.slice(-10);

  let current: PerformanceStreaks['current'] = null;
  const latest = results[results.length - 1];
  if (latest) {
    let count = 0;
    for (let i = results.length - 1; i >= 0; i -= 1) {
      if (results[i] !== latest) break;
      count += 1;
    }
    current = { result: latest, count };
  }

  let longestWin = 0;
  let longestLoss = 0;
  let runningWin = 0;
  let runningLoss = 0;
  for (const result of results) {
    if (result === 'win') {
      runningWin += 1;
      runningLoss = 0;
    } else if (result === 'loss') {
      runningLoss += 1;
      runningWin = 0;
    } else {
      runningWin = 0;
      runningLoss = 0;
    }
    longestWin = Math.max(longestWin, runningWin);
    longestLoss = Math.max(longestLoss, runningLoss);
  }

  return { recentGames, current, longestWin, longestLoss };
}

function incrementCounter(
  map: Map<string, RelationshipCounter>,
  user: InsightUser,
  outcome: StreakResult,
) {
  const entry = map.get(user.id) ?? { user, wins: 0, losses: 0, ties: 0 };
  if (outcome === 'win') entry.wins += 1;
  else if (outcome === 'loss') entry.losses += 1;
  else entry.ties += 1;
  map.set(user.id, entry);
}

function pickPartner(
  entries: RelationshipCounter[],
  direction: 'best' | 'worst',
): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const rateDiff = direction === 'best' ? winRate(b) - winRate(a) : winRate(a) - winRate(b);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties);
    if (totalDiff !== 0) return totalDiff;
    return compareName(a.user, b.user);
  })[0] ?? null;
}

function pickPartnerByCount(
  entries: RelationshipCounter[],
  direction: 'best' | 'worst',
): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const primaryDiff = direction === 'best' ? b.wins - a.wins : b.losses - a.losses;
    if (primaryDiff !== 0) return primaryDiff;
    const rateDiff = direction === 'best' ? winRate(b) - winRate(a) : winRate(a) - winRate(b);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties);
    if (totalDiff !== 0) return totalDiff;
    return compareName(a.user, b.user);
  })[0] ?? null;
}

function pickTarget(entries: RelationshipCounter[]): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const winsDiff = b.wins - a.wins;
    if (winsDiff !== 0) return winsDiff;
    const rateDiff = winRate(b) - winRate(a);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties);
    if (totalDiff !== 0) return totalDiff;
    return compareName(a.user, b.user);
  })[0] ?? null;
}

function pickNemesis(entries: RelationshipCounter[]): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const lossesDiff = b.losses - a.losses;
    if (lossesDiff !== 0) return lossesDiff;
    const rateDiff = winRate(a) - winRate(b);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties);
    if (totalDiff !== 0) return totalDiff;
    return compareName(a.user, b.user);
  })[0] ?? null;
}

export function buildPerformanceRelationships(
  userId: string,
  matches: RelationshipMatchInput[],
  sport: Sport,
): PerformanceRelationships {
  const partners = new Map<string, RelationshipCounter>();
  const opponents = new Map<string, RelationshipCounter>();

  for (const match of matches) {
    if (match.teams.length !== 2) continue;
    const userTeam = match.teams.find((team) =>
      team.players.some((player) => player.userId === userId),
    );
    const opponentTeam = match.teams.find((team) => team.id !== userTeam?.id);
    if (!userTeam || !opponentTeam) continue;

    const userTeamWon = match.winnerTeamId === userTeam.id;
    const opponentTeamWon = match.winnerTeamId === opponentTeam.id;
    const outcome: StreakResult = userTeamWon ? 'win' : opponentTeamWon ? 'loss' : 'tie';

    if (userTeam.players.length === 2) {
      const partner = userTeam.players.find((player) => player.userId !== userId);
      if (partner) incrementCounter(partners, partner.user, outcome);
    }

    const isOneVsOne = userTeam.players.length === 1 && opponentTeam.players.length === 1;
    const isTwoVsTwo = userTeam.players.length === 2 && opponentTeam.players.length === 2;
    if (isOneVsOne || isTwoVsTwo) {
      for (const opponent of opponentTeam.players) {
        incrementCounter(opponents, opponent.user, outcome);
      }
    }
  }

  const partnerEntries = [...partners.values()];
  const opponentEntries = [...opponents.values()];
  return {
    bestPartner: toRelationshipEntry(pickPartner(partnerEntries, 'best'), sport),
    worstPartner: toRelationshipEntry(pickPartner(partnerEntries, 'worst'), sport),
    bestPartnerByCount: toRelationshipEntry(pickPartnerByCount(partnerEntries, 'best'), sport),
    worstPartnerByCount: toRelationshipEntry(pickPartnerByCount(partnerEntries, 'worst'), sport),
    favoriteTarget: toRelationshipEntry(pickTarget(opponentEntries), sport),
    nemesis: toRelationshipEntry(pickNemesis(opponentEntries), sport),
  };
}

export async function getUserPerformanceInsights(
  userId: string,
  sport: Sport,
): Promise<UserPerformanceInsights> {
  const [outcomes, participations] = await Promise.all([
    prisma.gameOutcome.findMany({
      where: { userId, game: { sport } },
      orderBy: { createdAt: 'asc' },
      select: {
        isWinner: true,
        wins: true,
        ties: true,
        losses: true,
        createdAt: true,
      },
    }),
    prisma.gameParticipant.findMany({
      where: {
        userId,
        status: ParticipantStatus.PLAYING,
        game: {
          sport,
          resultsStatus: 'FINAL',
          entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
        },
      },
      include: {
        game: {
          include: {
            rounds: {
              include: {
                matches: {
                  include: {
                    teams: {
                      include: {
                        players: {
                          include: {
                            user: { select: INSIGHT_USER_SELECT },
                          },
                        },
                      },
                    },
                    sets: { orderBy: { setNumber: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const relationshipMatches: RelationshipMatchInput[] = [];
  for (const participation of participations) {
    const game = participation.game;
    for (const round of game.rounds) {
      for (const match of round.matches) {
        if (!isPrismaMatchCountedForStandingsAndRating(match, game)) continue;
        const officialSets = match.sets.filter((set) =>
          (set.teamAScore > 0 || set.teamBScore > 0) && isOfficialMatchSetRole(set.role),
        );
        if (officialSets.length === 0) continue;
        relationshipMatches.push({
          winnerTeamId: match.winnerId,
          teams: match.teams.map((team) => ({
            id: team.id,
            players: team.players.map((player) => ({
              userId: player.userId,
              user: player.user,
            })),
          })),
        });
      }
    }
  }

  return {
    streaks: buildPerformanceStreaks(outcomes),
    relationships: buildPerformanceRelationships(userId, relationshipMatches, sport),
  };
}
