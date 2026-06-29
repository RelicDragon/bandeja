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
  ratingNetChange: number;
}

export interface PerformanceRelationships {
  bestPartner: PerformanceRelationshipEntry | null;
  worstPartner: PerformanceRelationshipEntry | null;
  bestPartnerByRating: PerformanceRelationshipEntry | null;
  worstPartnerByRating: PerformanceRelationshipEntry | null;
  bestPartnerByCount: PerformanceRelationshipEntry | null;
  worstPartnerByCount: PerformanceRelationshipEntry | null;
  favoriteTarget: PerformanceRelationshipEntry | null;
  nemesis: PerformanceRelationshipEntry | null;
  favoriteTargetByRating: PerformanceRelationshipEntry | null;
  nemesisByRating: PerformanceRelationshipEntry | null;
  favoriteTargetByCount: PerformanceRelationshipEntry | null;
  nemesisByCount: PerformanceRelationshipEntry | null;
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
  ratingNetChange: number;
}

const RELATIONSHIP_BAYES_PRIOR_MATCHES = 4;
const RELATIONSHIP_BAYES_PRIOR_SCORE = 0.5;
const RELATIONSHIP_CONFIDENCE_MATCH_SCALE = 4;
const RELATIONSHIP_RATING_SCALE = 0.1;
const RELATIONSHIP_RATING_WEIGHT = 0.6;
const RELATIONSHIP_RECORD_WEIGHT = 0.4;
const RELATIONSHIP_MIN_CONFIDENT_MATCHES = 2;

export interface RelationshipMatchInput<TUser = InsightUser> {
  winnerTeamId: string | null;
  ratingDelta?: number;
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

function relationshipTotal(entry: Pick<RelationshipCounter, 'wins' | 'losses' | 'ties'>): number {
  return entry.wins + entry.losses + entry.ties;
}

function bayesianRelationshipRate(entry: Pick<RelationshipCounter, 'wins' | 'losses' | 'ties'>): number {
  const total = relationshipTotal(entry);
  const resultScore = entry.wins + (entry.ties * 0.5);
  return (
    resultScore + (RELATIONSHIP_BAYES_PRIOR_SCORE * RELATIONSHIP_BAYES_PRIOR_MATCHES)
  ) / (total + RELATIONSHIP_BAYES_PRIOR_MATCHES);
}

function relationshipConfidence(entry: Pick<RelationshipCounter, 'wins' | 'losses' | 'ties'>): number {
  return 1 - Math.exp(-relationshipTotal(entry) / RELATIONSHIP_CONFIDENCE_MATCH_SCALE);
}

function relationshipScore(entry: RelationshipCounter): number {
  const ratingSignal = Math.tanh(entry.ratingNetChange / RELATIONSHIP_RATING_SCALE);
  const recordSignal = 2 * (bayesianRelationshipRate(entry) - 0.5);
  return relationshipConfidence(entry) * (
    (RELATIONSHIP_RATING_WEIGHT * ratingSignal) +
    (RELATIONSHIP_RECORD_WEIGHT * recordSignal)
  );
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
    ratingNetChange: entry.ratingNetChange,
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
  ratingDelta = 0,
) {
  const entry = map.get(user.id) ?? { user, wins: 0, losses: 0, ties: 0, ratingNetChange: 0 };
  if (outcome === 'win') entry.wins += 1;
  else if (outcome === 'loss') entry.losses += 1;
  else entry.ties += 1;
  entry.ratingNetChange += ratingDelta;
  map.set(user.id, entry);
}

function pickPartner(
  entries: RelationshipCounter[],
  direction: 'best' | 'worst',
): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return pickByRelationshipScore(entries, direction);
}

function pickByRating(
  entries: RelationshipCounter[],
  direction: 'best' | 'worst',
): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const ratingDiff = direction === 'best'
      ? b.ratingNetChange - a.ratingNetChange
      : a.ratingNetChange - b.ratingNetChange;
    if (ratingDiff !== 0) return ratingDiff;
    const rateDiff = direction === 'best'
      ? bayesianRelationshipRate(b) - bayesianRelationshipRate(a)
      : bayesianRelationshipRate(a) - bayesianRelationshipRate(b);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = relationshipTotal(b) - relationshipTotal(a);
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
  return pickByRelationshipScore(entries, 'best');
}

function pickNemesis(entries: RelationshipCounter[]): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return pickByRelationshipScore(entries, 'worst');
}

function pickTargetByCount(entries: RelationshipCounter[]): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const winsDiff = b.wins - a.wins;
    if (winsDiff !== 0) return winsDiff;
    const rateDiff = winRate(b) - winRate(a);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = relationshipTotal(b) - relationshipTotal(a);
    if (totalDiff !== 0) return totalDiff;
    return compareName(a.user, b.user);
  })[0] ?? null;
}

function pickNemesisByCount(entries: RelationshipCounter[]): RelationshipCounter | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const lossesDiff = b.losses - a.losses;
    if (lossesDiff !== 0) return lossesDiff;
    const rateDiff = winRate(a) - winRate(b);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = relationshipTotal(b) - relationshipTotal(a);
    if (totalDiff !== 0) return totalDiff;
    return compareName(a.user, b.user);
  })[0] ?? null;
}

function pickByRelationshipScore(
  entries: RelationshipCounter[],
  direction: 'best' | 'worst',
): RelationshipCounter | null {
  const confidentEntries = entries.filter(
    (entry) => relationshipTotal(entry) >= RELATIONSHIP_MIN_CONFIDENT_MATCHES,
  );
  const candidates = confidentEntries.length > 0 ? confidentEntries : entries;
  return [...candidates].sort((a, b) => {
    const scoreDiff = direction === 'best'
      ? relationshipScore(b) - relationshipScore(a)
      : relationshipScore(a) - relationshipScore(b);
    if (scoreDiff !== 0) return scoreDiff;
    const ratingDiff = direction === 'best'
      ? b.ratingNetChange - a.ratingNetChange
      : a.ratingNetChange - b.ratingNetChange;
    if (ratingDiff !== 0) return ratingDiff;
    const rateDiff = direction === 'best'
      ? bayesianRelationshipRate(b) - bayesianRelationshipRate(a)
      : bayesianRelationshipRate(a) - bayesianRelationshipRate(b);
    if (rateDiff !== 0) return rateDiff;
    const totalDiff = relationshipTotal(b) - relationshipTotal(a);
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
      if (partner) incrementCounter(partners, partner.user, outcome, match.ratingDelta ?? 0);
    }

    const isOneVsOne = userTeam.players.length === 1 && opponentTeam.players.length === 1;
    const isTwoVsTwo = userTeam.players.length === 2 && opponentTeam.players.length === 2;
    if (isOneVsOne || isTwoVsTwo) {
      const opponentRatingDelta = (match.ratingDelta ?? 0) / Math.max(opponentTeam.players.length, 1);
      for (const opponent of opponentTeam.players) {
        incrementCounter(opponents, opponent.user, outcome, opponentRatingDelta);
      }
    }
  }

  const partnerEntries = [...partners.values()];
  const opponentEntries = [...opponents.values()];
  return {
    bestPartner: toRelationshipEntry(pickPartner(partnerEntries, 'best'), sport),
    worstPartner: toRelationshipEntry(pickPartner(partnerEntries, 'worst'), sport),
    bestPartnerByRating: toRelationshipEntry(pickByRating(partnerEntries, 'best'), sport),
    worstPartnerByRating: toRelationshipEntry(pickByRating(partnerEntries, 'worst'), sport),
    bestPartnerByCount: toRelationshipEntry(pickPartnerByCount(partnerEntries, 'best'), sport),
    worstPartnerByCount: toRelationshipEntry(pickPartnerByCount(partnerEntries, 'worst'), sport),
    favoriteTarget: toRelationshipEntry(pickTarget(opponentEntries), sport),
    nemesis: toRelationshipEntry(pickNemesis(opponentEntries), sport),
    favoriteTargetByRating: toRelationshipEntry(pickByRating(opponentEntries, 'best'), sport),
    nemesisByRating: toRelationshipEntry(pickByRating(opponentEntries, 'worst'), sport),
    favoriteTargetByCount: toRelationshipEntry(pickTargetByCount(opponentEntries), sport),
    nemesisByCount: toRelationshipEntry(pickNemesisByCount(opponentEntries), sport),
  };
}

function isRelationshipRatingMatch(userId: string, match: RelationshipMatchInput): boolean {
  if (match.teams.length !== 2) return false;
  const userTeam = match.teams.find((team) =>
    team.players.some((player) => player.userId === userId),
  );
  const opponentTeam = match.teams.find((team) => team.id !== userTeam?.id);
  if (!userTeam || !opponentTeam) return false;

  const hasPartnerRelationship = userTeam.players.length === 2;
  const hasOneVsOneOpponentRelationship = userTeam.players.length === 1 && opponentTeam.players.length === 1;
  const hasTwoVsTwoOpponentRelationship = userTeam.players.length === 2 && opponentTeam.players.length === 2;
  return hasPartnerRelationship || hasOneVsOneOpponentRelationship || hasTwoVsTwoOpponentRelationship;
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
        gameId: true,
        isWinner: true,
        wins: true,
        ties: true,
        losses: true,
        levelChange: true,
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
  const userOutcomeByGameId = new Map(
    outcomes.map((outcome) => [outcome.gameId, outcome]),
  );
  for (const participation of participations) {
    const game = participation.game;
    const gameRelationshipMatches: RelationshipMatchInput[] = [];
    for (const round of game.rounds) {
      for (const match of round.matches) {
        if (!isPrismaMatchCountedForStandingsAndRating(match, game)) continue;
        const officialSets = match.sets.filter((set) =>
          (set.teamAScore > 0 || set.teamBScore > 0) && isOfficialMatchSetRole(set.role),
        );
        if (officialSets.length === 0) continue;
        gameRelationshipMatches.push({
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

    const relationshipRatingMatchCount = gameRelationshipMatches.filter((match) =>
      isRelationshipRatingMatch(userId, match),
    ).length;
    const gameRatingDelta = userOutcomeByGameId.get(game.id)?.levelChange ?? 0;
    const matchRatingDelta = relationshipRatingMatchCount > 0
      ? gameRatingDelta / relationshipRatingMatchCount
      : 0;

    relationshipMatches.push(
      ...gameRelationshipMatches.map((match) => ({
        ...match,
        ratingDelta: matchRatingDelta,
      })),
    );
  }

  return {
    streaks: buildPerformanceStreaks(outcomes),
    relationships: buildPerformanceRelationships(userId, relationshipMatches, sport),
  };
}
