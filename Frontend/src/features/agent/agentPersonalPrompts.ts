import type { Game, Invite } from '@/types';
import type { OwedCostShare, OwedSummary } from '@/api/gameCost';
import { isInviteInboxVisible } from '@/utils/gameInviteInbox';

/**
 * Personalized empty-state prompts (docs/domains/agent.md, app section). Built only from data
 * the app already holds (my-tab games + invites, the cached past-games list, the owed-shares
 * summary); no endpoint of its own. Text lives in `agent.personal.<kind>.*`.
 */
export type AgentPersonalPromptKind =
  | 'enterScore'
  | 'needsPlayers'
  | 'remindPay'
  | 'pendingInvite'
  | 'payShare'
  | 'leagueNext'
  | 'nextGameWeather';

export const AGENT_PERSONAL_PROMPT_MAX = 4;

export interface AgentPersonalPrompt {
  /** Stable React key: kind + source id. */
  id: string;
  kind: AgentPersonalPromptKind;
  gameId: string | null;
  /** Interpolation values for `agent.personal.<kind>.prompt` / `.context`. */
  vars: Record<string, string | number>;
  /** Club / venue for the context line; null when unknown. */
  place: string | null;
}

export interface AgentPersonalPromptInput {
  userId: string;
  games: readonly Game[];
  /** Past-games list only when it is already cached (never fetched for this). */
  pastGames?: readonly Game[];
  invites: readonly Invite[];
  owed?: OwedSummary | null;
  now: Date;
  /** Short "Thu 19:00" in the viewer's 12/24 h setting; `timeZone` = the game's city. */
  formatWhen: (iso: string, timeZone: string | null) => string;
}

const DAY_MS = 86_400_000;
const SCORE_WINDOW_MS = 3 * DAY_MS;
const OPEN_SPOTS_WINDOW_MS = 14 * DAY_MS;
const WEATHER_WINDOW_MS = 7 * DAY_MS;

const PLAYABLE_TYPES = new Set(['GAME', 'TOURNAMENT', 'TRAINING']);
const SCORED_TYPES = new Set(['GAME', 'TOURNAMENT', 'LEAGUE']);

function time(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return new Date(iso).getTime();
}

function myRow(game: Game, userId: string) {
  return game.participants?.find((p) => p.userId === userId) ?? null;
}

function isOrganizer(game: Game, userId: string): boolean {
  const row = myRow(game, userId);
  return row?.role === 'OWNER' || row?.role === 'ADMIN';
}

function playingCount(game: Game): number {
  return (game.participants ?? []).filter((p) => p.status === 'PLAYING').length;
}

function placeOf(game: Game | undefined | null): string | null {
  if (!game) return null;
  return game.club?.name?.trim() || game.venueText?.trim() || null;
}

function firstName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return user?.firstName?.trim() || user?.lastName?.trim() || '';
}

function dedupeGames(lists: ReadonlyArray<readonly Game[] | undefined>): Game[] {
  const seen = new Set<string>();
  const out: Game[] = [];
  for (const list of lists) {
    for (const game of list ?? []) {
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      out.push(game);
    }
  }
  return out;
}

/** Most recent finished game of mine whose score I may enter and nobody finalized. */
function enterScorePrompt(input: AgentPersonalPromptInput, games: Game[]): AgentPersonalPrompt | null {
  const now = input.now.getTime();
  const candidates = games.filter((g) => {
    if (!SCORED_TYPES.has(g.entityType)) return false;
    if (g.status !== 'STARTED' && g.status !== 'FINISHED') return false;
    if (g.resultsStatus === 'FINAL') return false;
    const end = time(g.endTime);
    if (!(end <= now) || now - end > SCORE_WINDOW_MS) return false;
    const row = myRow(g, input.userId);
    return isOrganizer(g, input.userId) || (Boolean(g.resultsByAnyone) && row?.status === 'PLAYING');
  });
  candidates.sort((a, b) => time(b.endTime) - time(a.endTime));
  const game = candidates[0];
  if (!game) return null;
  return {
    id: `enterScore:${game.id}`,
    kind: 'enterScore',
    gameId: game.id,
    vars: { when: input.formatWhen(game.startTime, game.city?.timezone ?? null) },
    place: placeOf(game),
  };
}

/** Soonest upcoming game I organize that still has a free playing spot. */
function needsPlayersPrompt(input: AgentPersonalPromptInput, games: Game[]): AgentPersonalPrompt | null {
  const now = input.now.getTime();
  const candidates = games.filter((g) => {
    if (!PLAYABLE_TYPES.has(g.entityType) || g.status !== 'ANNOUNCED') return false;
    if (g.timeIsSet === false) return false;
    const start = time(g.startTime);
    if (!(start > now) || start - now > OPEN_SPOTS_WINDOW_MS) return false;
    if (!isOrganizer(g, input.userId)) return false;
    return g.maxParticipants > 0 && playingCount(g) < g.maxParticipants;
  });
  candidates.sort((a, b) => time(a.startTime) - time(b.startTime));
  const game = candidates[0];
  if (!game) return null;
  return {
    id: `needsPlayers:${game.id}`,
    kind: 'needsPlayers',
    gameId: game.id,
    vars: {
      when: input.formatWhen(game.startTime, game.city?.timezone ?? null),
      playing: playingCount(game),
      max: game.maxParticipants,
    },
    place: placeOf(game),
  };
}

function unpaid(rows: readonly OwedCostShare[] | undefined): OwedCostShare[] {
  return (rows ?? []).filter((r) => r.state === 'UNPAID' && r.startTime);
}

/** A game where others still owe me; the most recent one. */
function remindPayPrompt(input: AgentPersonalPromptInput, gamesById: Map<string, Game>): AgentPersonalPrompt | null {
  const rows = unpaid(input.owed?.owedToMe);
  if (!rows.length) return null;
  const byGame = new Map<string, OwedCostShare[]>();
  for (const row of rows) byGame.set(row.gameId, [...(byGame.get(row.gameId) ?? []), row]);
  const [gameId, shares] = [...byGame.entries()].sort(
    (a, b) => time(b[1][0].startTime) - time(a[1][0].startTime),
  )[0];
  const game = gamesById.get(gameId);
  return {
    id: `remindPay:${gameId}`,
    kind: 'remindPay',
    gameId,
    vars: {
      when: input.formatWhen(shares[0].startTime!, game?.city?.timezone ?? null),
      count: shares.length,
    },
    place: placeOf(game),
  };
}

/** My own unpaid share; the oldest one first (it has waited longest). */
function paySharePrompt(input: AgentPersonalPromptInput, gamesById: Map<string, Game>): AgentPersonalPrompt | null {
  const rows = unpaid(input.owed?.owed).sort((a, b) => time(a.startTime) - time(b.startTime));
  const share = rows[0];
  if (!share) return null;
  const game = gamesById.get(share.gameId);
  return {
    id: `payShare:${share.gameId}`,
    kind: 'payShare',
    gameId: share.gameId,
    vars: {
      when: input.formatWhen(share.startTime!, game?.city?.timezone ?? null),
      name: firstName(share.counterparty),
    },
    place: placeOf(game),
  };
}

/** Soonest invite the inbox shows (a free seat for me). */
function pendingInvitePrompt(input: AgentPersonalPromptInput): AgentPersonalPrompt | null {
  const now = input.now.getTime();
  const candidates = input.invites.filter(
    (inv) => inv.game && time(inv.game.startTime) > now && isInviteInboxVisible(inv, input.now),
  );
  candidates.sort((a, b) => time(a.game!.startTime) - time(b.game!.startTime));
  const invite = candidates[0];
  if (!invite?.game) return null;
  return {
    id: `pendingInvite:${invite.id}`,
    kind: 'pendingInvite',
    gameId: invite.game.id,
    vars: {
      when: input.formatWhen(invite.game.startTime, invite.game.city?.timezone ?? null),
      name: firstName(invite.sender),
    },
    place: placeOf(invite.game),
  };
}

/** A running league season I own or admin. */
function leagueNextPrompt(input: AgentPersonalPromptInput, games: Game[]): AgentPersonalPrompt | null {
  const season = games.find(
    (g) =>
      g.entityType === 'LEAGUE_SEASON' &&
      (g.status === 'ANNOUNCED' || g.status === 'STARTED') &&
      isOrganizer(g, input.userId),
  );
  if (!season) return null;
  const league = season.leagueSeason?.league?.name?.trim() || season.name?.trim();
  if (!league) return null;
  return {
    id: `leagueNext:${season.id}`,
    kind: 'leagueNext',
    gameId: season.id,
    vars: { league },
    place: null,
  };
}

/** My next game this week I'm playing in (weather check). */
function nextGameWeatherPrompt(
  input: AgentPersonalPromptInput,
  games: Game[],
  taken: Set<string>,
): AgentPersonalPrompt | null {
  const now = input.now.getTime();
  const candidates = games.filter((g) => {
    if (!PLAYABLE_TYPES.has(g.entityType) && g.entityType !== 'LEAGUE') return false;
    if (g.status !== 'ANNOUNCED' || g.timeIsSet === false || taken.has(g.id)) return false;
    const start = time(g.startTime);
    if (!(start > now) || start - now > WEATHER_WINDOW_MS) return false;
    return myRow(g, input.userId)?.status === 'PLAYING';
  });
  candidates.sort((a, b) => time(a.startTime) - time(b.startTime));
  const game = candidates[0];
  if (!game) return null;
  return {
    id: `nextGameWeather:${game.id}`,
    kind: 'nextGameWeather',
    gameId: game.id,
    vars: { when: input.formatWhen(game.startTime, game.city?.timezone ?? null) },
    place: placeOf(game),
  };
}

/**
 * Up to `limit` prompts, one per kind, most actionable first: a score to enter, open spots
 * on my game, money owed to me, an invite, my own share, my league, then my next game's weather.
 */
export function buildAgentPersonalPrompts(
  input: AgentPersonalPromptInput,
  limit = AGENT_PERSONAL_PROMPT_MAX,
): AgentPersonalPrompt[] {
  const games = dedupeGames([input.games, input.pastGames]);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const out: AgentPersonalPrompt[] = [];
  const push = (prompt: AgentPersonalPrompt | null) => {
    if (prompt && out.length < limit) out.push(prompt);
  };

  push(enterScorePrompt(input, games));
  push(needsPlayersPrompt(input, games));
  push(remindPayPrompt(input, gamesById));
  push(pendingInvitePrompt(input));
  push(paySharePrompt(input, gamesById));
  push(leagueNextPrompt(input, games));
  push(
    nextGameWeatherPrompt(
      input,
      games,
      new Set(out.map((p) => p.gameId).filter((id): id is string => Boolean(id))),
    ),
  );
  return out;
}

/**
 * "Thu 19:00" within six days either side of `now`, else "3 Oct, 19:00", in the viewer's
 * locale and 12/24 h preference (`resolveDisplaySettings`), in `timeZone` when given.
 */
export function formatAgentShortWhen(
  iso: string,
  settings: { locale: string; hour12: boolean },
  timeZone: string | null,
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const near = Math.abs(date.getTime() - now.getTime()) < 6 * DAY_MS;
  const options: Intl.DateTimeFormatOptions = near
    ? { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: settings.hour12 }
    : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: settings.hour12 };
  try {
    return new Intl.DateTimeFormat(settings.locale, timeZone ? { ...options, timeZone } : options).format(date);
  } catch {
    return new Intl.DateTimeFormat(settings.locale, options).format(date);
  }
}
