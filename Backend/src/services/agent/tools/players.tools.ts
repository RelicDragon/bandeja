/**
 * Player read tools: `search_players`, `get_player`.
 *
 * `search_players` has the same scope as the in-app player picker
 * (`GET /users/invitable-players`, `controllers/user/social.controller.ts`): active users
 * in the principal's current city plus their top co-players, minus self and anyone in a
 * block relation. It matches first/last name only (not Telegram usernames) and returns
 * public card fields only. Unlike the picker it also matches across Serbian Cyrillic and
 * diacritics (`agentPlayerNameVariants`): the model often writes a name the way the user did.
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

/** Serbian Cyrillic letters the shared transliteration (Russian-based) doesn't know, to Serbian Latin. */
const SERBIAN_CYRILLIC: Record<string, string> = {
  ј: 'j', Ј: 'J', љ: 'lj', Љ: 'Lj', њ: 'nj', Њ: 'Nj', ћ: 'ć', Ћ: 'Ć', ђ: 'đ', Ђ: 'Đ', џ: 'dž', Џ: 'Dž',
};

export function serbianCyrillicToLatin(text: string): string {
  return text.replace(/[јЈљЉњЊћЋђЂџЏ]/g, (ch) => SERBIAN_CYRILLIC[ch] ?? ch);
}

/** Plain-Latin letters that names often carry with a diacritic (Serbian / Croatian / Czech). */
const DIACRITIC_VARIANTS: Record<string, string[]> = { c: ['č', 'ć'], s: ['š'], z: ['ž'], d: ['đ'] };
const MAX_DIACRITIC_VARIANTS = 12;

/**
 * Spellings of a plain-Latin `variant` with the diacritics the stored name may have
 * ("popovic" → "popović", "popovič"), because the DB filter (`contains`, ILIKE) is
 * accent-sensitive. Too many combinations → the longest run of letters without such a
 * letter (≥ 3 chars) instead; the exact match is `matchesPersonSearch` on the rows.
 */
export function diacriticSpellings(variant: string): string[] {
  const latin = variant.toLowerCase();
  if (!/^[a-z]+$/.test(latin)) return [];
  let out = [''];
  for (const ch of latin) {
    const options = [ch, ...(DIACRITIC_VARIANTS[ch] ?? [])];
    out = out.flatMap((prefix) => options.map((option) => prefix + option));
    if (out.length > MAX_DIACRITIC_VARIANTS) {
      const run = latin.split(/[cszd]/).sort((a, b) => b.length - a.length)[0] ?? '';
      return run.length >= 3 && run !== latin ? [run] : [];
    }
  }
  return out.filter((spelling) => spelling !== latin);
}

/**
 * DB-side name variants of one query term: the shared expansion (`expandNameSearchTerms`:
 * Russian Cyrillic ↔ Latin, ch/c, zh/j, dj/d …) on the term with Serbian Cyrillic mapped
 * first, plus diacritic spellings of the plain-Latin variants. So "Елена Попович", "Јелена
 * Поповић" and "Jelena Popovic" all reach "Jelena Popović".
 */
export function agentPlayerNameVariants(term: string): string[] {
  const expanded = expandNameSearchTerms(serbianCyrillicToLatin(term));
  // Russian-style digraphs (ш → sh, ж → zh, ч → ch) are one letter in Serbian Latin (š ž č).
  const base = [...expanded, ...expanded.map((v) => v.toLowerCase().replace(/sh/g, 's').replace(/zh/g, 'z').replace(/ch/g, 'c'))];
  const all = new Set(base);
  for (const variant of base) for (const spelling of diacriticSpellings(variant)) all.add(spelling);
  return [...all].slice(0, 40);
}

export const searchPlayersTool = defineTool({
  name: 'search_players',
  description:
    "Find players by name among people in the user's city and people they played with. Matches across Cyrillic and Latin spellings and diacritics, so pass the name as the user wrote it. Returns public profile cards (name, level, trainer flag).",
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
    const query = serbianCyrillicToLatin(args.query);
    const terms = args.query.split(/\s+/).filter(Boolean).slice(0, 5);
    const nameWhere: Prisma.UserWhereInput = {
      AND: terms.map((term) => ({
        OR: agentPlayerNameVariants(term).flatMap((variant) => [
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
      .filter((row) => matchesPersonSearch(query, { firstName: row.firstName, lastName: row.lastName }))
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
