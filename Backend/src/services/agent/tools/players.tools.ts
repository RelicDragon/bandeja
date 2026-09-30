/**
 * Player read tools: `search_players`, `get_player`.
 *
 * `search_players` has the same scope as the in-app player picker
 * (`GET /users/invitable-players`, `controllers/user/social.controller.ts`): active users
 * in the principal's current city plus their top co-players, minus self and anyone in a
 * block relation. It matches first/last name only (not Telegram usernames) and returns
 * public card fields only.
 */
import { Sport, type Prisma } from '@prisma/client';
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { CO_PLAY_TOP_LIMIT, loadBlockedUserIds, loadCoPlayers, pickTopCoPlayerIds } from '../../user/coPlay.service';
import { expandNameSearchTerms, matchesPersonSearch } from '../../../utils/nameSearchTerms';
import {
  AGENT_PLAYER_PROFILE_SELECT,
  AGENT_USER_CARD_SELECT,
  agentUserEntity,
  toAgentPlayerProfile,
  toAgentUserCard,
} from '../dto/user.dto';
import { agentT } from '../i18n/agentI18n';
import { defineTool } from './registry';

const SPORTS = Object.values(Sport) as [Sport, ...Sport[]];

export const searchPlayersTool = defineTool({
  name: 'search_players',
  description:
    "Find players by name among people in the user's city and people they played with. Returns public profile cards (name, level, trainer flag).",
  kind: 'read',
  scope: 'user',
  input: z.object({
    query: z.string().trim().min(1).max(80).describe('First and/or last name'),
    sport: z.enum(SPORTS).optional().describe('Sport for the level shown; defaults to each player’s primary sport'),
    limit: z.number().int().min(1).max(20).default(10),
  }).strict(),
  label: (_args, locale) => agentT(locale, 'label.searchPlayers'),
  handler: async (ctx, args) => {
    const { principal } = ctx;
    if (!principal.currentCityId) {
      throw new ApiError(400, 'No home city set');
    }
    const terms = args.query.split(/\s+/).filter(Boolean).slice(0, 5);
    const nameWhere: Prisma.UserWhereInput = {
      AND: terms.map((term) => ({
        OR: expandNameSearchTerms(term).flatMap((variant) => [
          { firstName: { contains: variant, mode: 'insensitive' as const } },
          { lastName: { contains: variant, mode: 'insensitive' as const } },
        ]),
      })),
    };
    const [blocked, coPlayers] = await Promise.all([
      loadBlockedUserIds(principal.userId),
      loadCoPlayers(principal.userId),
    ]);
    const excluded = new Set<string>([...blocked, principal.userId]);
    const topCoPlayerIds = pickTopCoPlayerIds(coPlayers, excluded, CO_PLAY_TOP_LIMIT);
    const rows = await prisma.user.findMany({
      where: {
        AND: [
          { isActive: true },
          { id: { notIn: [...excluded] } },
          { OR: [{ currentCityId: principal.currentCityId }, { id: { in: topCoPlayerIds } }] },
          nameWhere,
        ],
      },
      select: AGENT_USER_CARD_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 100,
    });
    const coPlayCount = new Map(coPlayers.map((row) => [row.userId, row.gamesTogetherCount]));
    const matched = rows
      .filter((row) => matchesPersonSearch(args.query, { firstName: row.firstName, lastName: row.lastName }))
      .sort((a, b) => (coPlayCount.get(b.id) ?? 0) - (coPlayCount.get(a.id) ?? 0))
      .slice(0, args.limit);
    return {
      data: {
        players: matched.map((row) => ({
          ...toAgentUserCard(row, args.sport ?? null),
          gamesTogether: coPlayCount.get(row.id) ?? 0,
        })),
      },
      summary: agentT(ctx.locale, 'summary.players', { count: matched.length }),
      entities: matched.map(agentUserEntity),
    };
  },
});

export const getPlayerTool = defineTool({
  name: 'get_player',
  description: "Get a player's public profile card: name, bio, trainer flag, level and games per sport.",
  kind: 'read',
  scope: 'user',
  input: z.object({ userId: z.string().min(1).max(64).describe('Player id from another tool result') }).strict(),
  label: (_args, locale) => agentT(locale, 'label.getPlayer'),
  handler: async (ctx, args) => {
    const row = await prisma.user.findUnique({ where: { id: args.userId }, select: AGENT_PLAYER_PROFILE_SELECT });
    if (!row || !row.isActive) throw new ApiError(404, 'User not found');
    if (row.id !== ctx.principal.userId) {
      const blocked = await loadBlockedUserIds(ctx.principal.userId);
      if (blocked.has(row.id)) throw new ApiError(404, 'User not found');
    }
    const profile = toAgentPlayerProfile(row);
    return {
      data: profile,
      summary: profile.name,
      entities: [agentUserEntity(row)],
    };
  },
});

export const PLAYER_TOOLS = [searchPlayersTool, getPlayerTool];
