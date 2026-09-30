/**
 * Club and city read tools: `search_clubs`, `get_club`, `list_cities`.
 * Public data only (active clubs / cities), same whitelist idea as `clubPublic.projection.ts`.
 */
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import {
  AGENT_CLUB_DETAIL_SELECT,
  AGENT_CLUB_SUMMARY_SELECT,
  agentClubEntity,
  toAgentClubDetail,
  toAgentClubSummary,
} from '../dto/club.dto';
import { agentT } from '../i18n/agentI18n';
import { defineTool } from './registry';

export const searchClubsTool = defineTool({
  name: 'search_clubs',
  description: 'Search clubs (venues) by name in a city. Defaults to the home city.',
  kind: 'read',
  scope: 'user',
  input: z.object({
    cityId: z.string().min(1).max(64).optional().describe('City id from list_cities; defaults to the home city'),
    query: z.string().max(80).optional().describe('Text to match in the club name or address'),
    limit: z.number().int().min(1).max(30).default(15),
  }).strict(),
  label: (_args, locale) => agentT(locale, 'label.searchClubs'),
  handler: async (ctx, args) => {
    const cityId = args.cityId ?? ctx.principal.currentCityId;
    if (!cityId) {
      throw new ApiError(400, 'No home city set; pass cityId (see list_cities)');
    }
    const query = args.query?.trim();
    const rows = await prisma.club.findMany({
      where: {
        cityId,
        isActive: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { address: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: AGENT_CLUB_SUMMARY_SELECT,
      orderBy: { name: 'asc' },
      take: args.limit,
    });
    return {
      data: { cityId, clubs: rows.map(toAgentClubSummary) },
      summary: agentT(ctx.locale, 'summary.clubs', { count: rows.length }),
      entities: rows.map(agentClubEntity),
    };
  },
});

export const getClubTool = defineTool({
  name: 'get_club',
  description: 'Get one club: address, contacts, opening hours, courts and prices.',
  kind: 'read',
  scope: 'user',
  input: z.object({ clubId: z.string().min(1).max(64) }).strict(),
  label: (_args, locale) => agentT(locale, 'label.getClub'),
  handler: async (_ctx, args) => {
    const row = await prisma.club.findUnique({ where: { id: args.clubId }, select: AGENT_CLUB_DETAIL_SELECT });
    if (!row || !row.isActive) throw new ApiError(404, 'Club not found');
    return {
      data: toAgentClubDetail(row),
      summary: row.name,
      entities: [agentClubEntity(row)],
    };
  },
});

export const listCitiesTool = defineTool({
  name: 'list_cities',
  description: 'List active cities (id, name, country, timezone). Filter by name or country.',
  kind: 'read',
  scope: 'user',
  input: z.object({
    query: z.string().max(80).optional(),
    country: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }).strict(),
  label: (_args, locale) => agentT(locale, 'label.listCities'),
  handler: async (ctx, args) => {
    const query = args.query?.trim();
    const country = args.country?.trim();
    const rows = await prisma.city.findMany({
      where: {
        isActive: true,
        ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
        ...(country ? { country: { contains: country, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, country: true, timezone: true, clubsCount: true },
      orderBy: [{ clubsCount: 'desc' }, { name: 'asc' }],
      take: args.limit,
    });
    return {
      data: {
        homeCityId: ctx.principal.currentCityId,
        cities: rows.map((city) => ({
          cityId: city.id,
          name: city.name,
          country: city.country,
          timezone: city.timezone,
          clubsCount: city.clubsCount,
        })),
      },
      summary: agentT(ctx.locale, 'summary.cities', { count: rows.length }),
    };
  },
});

export const CLUB_TOOLS = [searchClubsTool, getClubTool, listCitiesTool];
