/**
 * `find_available_slots` (booking plan §14.6, slice 7b): read-only court availability for
 * one club or up to 8 clubs of a city, via the slot engine
 * (`services/agent/booking/slotEngine/`). Every slot carries a confidence (live / snapshot /
 * app_only) and a signed `slotRef` for the booking tools.
 */
import { Sport } from '@prisma/client';
import { z } from 'zod/v4';
import { ApiError } from '../../../utils/ApiError';
import { isCalendarDate } from '../booking/slotEngine/clubTime';
import { findAvailableSlots, loadSlotSearchClubs } from '../booking/slotEngine/slotSearch';
import { defaultSlotEngineSources } from '../booking/slotEngine/slotSources';
import { agentSlotsT } from '../i18n/agentSlotsI18n';
import { defineTool } from './registry';

const SPORTS = Object.values(Sport) as [Sport, ...Sport[]];
const CLOCK = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');

export const findAvailableSlotsTool = defineTool({
  name: 'find_available_slots',
  description:
    'Find bookable court slots at one club (clubId) or at up to 8 clubs of a city (cityId, default home city) on a date. Times are the club\'s local time. Each slot has a confidence: live (checked with the club system now), snapshot (no known conflicts as of asOf, never say "free"), app_only (only app games checked). Returns slotRef values for booking. When the user asked to book or to create a game at a found time, go on and propose it (earliest matching slot unless they chose) instead of only listing the slots.',
  kind: 'read',
  scope: 'user',
  input: z
    .object({
      clubId: z.string().min(1).max(64).optional().describe("A club's id (search_clubs / get_club, or a game's clubId), never a game id; omit to search a city"),
      cityId: z.string().min(1).max(64).optional().describe('City id from list_cities; defaults to the home city'),
      date: z.string().describe('YYYY-MM-DD, the club\'s local calendar date'),
      timeFrom: CLOCK.optional().describe('Earliest start, HH:mm club time'),
      timeTo: CLOCK.optional().describe('Latest start, HH:mm club time'),
      durationMinutes: z.number().int().min(30).max(240).describe('Usually 60, 90 or 120'),
      courts: z.number().int().min(1).max(4).default(1).describe('Courts needed at the same time'),
      sport: z.enum(SPORTS).optional(),
    })
    .strict(),
  label: (_args, locale) => agentSlotsT(locale, 'label.findSlots'),
  handler: async (ctx, args) => {
    if (!isCalendarDate(args.date)) throw new ApiError(400, 'date must be YYYY-MM-DD');
    if (args.clubId && args.cityId) throw new ApiError(400, 'Pass clubId or cityId, not both');
    return findAvailableSlots(
      { principal: ctx.principal, locale: ctx.locale, now: ctx.now },
      args,
      { sources: defaultSlotEngineSources, loadClubs: loadSlotSearchClubs },
    );
  },
});

export const SLOT_TOOLS = [findAvailableSlotsTool];
