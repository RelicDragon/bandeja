/**
 * Wrong-kind id hints for `not_found` tool results (`registry.executeTool`). The model sometimes
 * passes the right id to the wrong argument (a game id as `clubId`): instead of a bare
 * not_found it learns what the id is, and for a game passed as a club, the game's club id.
 *
 * Visibility: a game is described only when the principal may see it (`assertAgentCanViewGame`);
 * clubs, courts and cities are public; a player id is only named as such. Never auto-corrects:
 * the model still has to call the tool again with the right id.
 */
import prisma from '../../../config/database';
import { assertAgentCanViewGame } from '../access/agentGameAccess';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { agentGameTitle } from '../dto/game.dto';

type IdKind = 'game' | 'club' | 'player' | 'city' | 'court';

/** Argument name → the kind of id it expects. Only plain top-level string args are checked. */
const EXPECTED_KIND: Record<string, IdKind> = {
  gameId: 'game',
  clubId: 'club',
  userId: 'player',
  playerId: 'player',
  cityId: 'city',
  courtId: 'court',
};

const ID_SHAPE = /^[a-z0-9]{20,40}$/i;

async function kindOf(principal: AgentPrincipal, id: string): Promise<{ kind: IdKind; detail?: string; clubId?: string | null } | null> {
  const [game, club, user, city, court] = await Promise.all([
    prisma.game.findUnique({ where: { id }, select: { id: true, name: true, entityType: true, clubId: true, club: { select: { name: true } } } }),
    prisma.club.findUnique({ where: { id }, select: { name: true } }),
    prisma.user.findUnique({ where: { id }, select: { id: true } }),
    prisma.city.findUnique({ where: { id }, select: { name: true } }),
    prisma.court.findUnique({ where: { id }, select: { name: true, clubId: true } }),
  ]);
  if (game) {
    try {
      await assertAgentCanViewGame(principal, id);
    } catch {
      return null;
    }
    return { kind: 'game', detail: agentGameTitle(game), clubId: game.clubId };
  }
  if (club) return { kind: 'club', detail: club.name };
  if (user) return { kind: 'player' };
  if (city) return { kind: 'city', detail: city.name };
  if (court) return { kind: 'court', detail: court.name, clubId: court.clubId };
  return null;
}

/**
 * Hints for every id argument whose value is an id of another kind, e.g.
 * `clubId is a game id (game "Evening doubles"), not a club id; that game's clubId is "…"`.
 * The passed value is never echoed back.
 * Empty when nothing is off. Never throws.
 */
export async function agentWrongKindIdHints(principal: AgentPrincipal, rawArgs: unknown): Promise<string[]> {
  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) return [];
  const hints: string[] = [];
  try {
    for (const [key, value] of Object.entries(rawArgs as Record<string, unknown>)) {
      const expected = EXPECTED_KIND[key];
      if (!expected || typeof value !== 'string' || !ID_SHAPE.test(value)) continue;
      const actual = await kindOf(principal, value);
      // Nothing visible with this id: plain not_found (hidden and missing stay indistinguishable).
      if (!actual || actual.kind === expected) continue;
      let hint = `${key} is a ${actual.kind} id${actual.detail ? ` (${actual.kind} "${actual.detail}")` : ''}, not a ${expected} id`;
      if (expected === 'club' && actual.clubId) hint += `; that ${actual.kind}'s clubId is "${actual.clubId}"`;
      hints.push(`${hint}.`);
    }
  } catch (error) {
    console.error('[agent] id hint lookup failed', { error });
  }
  return hints.slice(0, 3);
}
