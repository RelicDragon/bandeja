/**
 * Booking read tools (phase 7a): `list_my_bookings`.
 * Sources, dedupe, `bookingRef` and `canCancel`: `booking/agentBookingSources.ts`.
 */
import { z } from 'zod/v4';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import { listAgentBookings } from '../booking/agentBookingSources';
import { agentBookingEntity, toAgentBookingDto } from '../dto/booking.dto';
import { agentBookingT } from '../i18n/agentBookingI18n';
import { defineTool } from './registry';

export const CONNECTED_CLUBS_PATH = '/profile/connected-clubs';

export const listMyBookingsTool = defineTool({
  name: 'list_my_bookings',
  description:
    "List the user's court bookings: bookings linked to games they organise or play in, their own club receipts, and club bookings the app synced. range=upcoming (soonest first) or past (most recent first). Times are in the club's timezone. When listComplete is false, some bookings are only visible in the app (Connected clubs).",
  kind: 'read',
  scope: 'user',
  input: z.object({
    range: z.enum(['upcoming', 'past']).default('upcoming'),
    clubId: z.string().min(1).max(64).optional().describe('Only bookings at this club (id from search_clubs)'),
    limit: z.number().int().min(1).max(30).default(10),
  }).strict(),
  label: (args, locale) =>
    agentBookingT(locale, args?.range === 'past' ? 'label.listMyBookingsPast' : 'label.listMyBookings'),
  handler: async (ctx, args) => {
    const list = await listAgentBookings(ctx.principal, {
      range: args.range,
      clubId: args.clubId,
      limit: args.limit,
      now: ctx.now,
    });
    const entities: AgentEntityRef[] = list.items.map(agentBookingEntity);
    if (!list.listComplete) {
      entities.push({
        type: 'handoff',
        url: CONNECTED_CLUBS_PATH,
        label: agentBookingT(ctx.locale, 'handoff.connectedClubs'),
      });
    }
    return {
      data: {
        range: args.range,
        bookings: list.items.map(toAgentBookingDto),
        listComplete: list.listComplete,
        ...(list.listComplete
          ? {}
          : {
              incompleteProviders: list.incompleteProviders,
              note: `Bookings made with ${list.incompleteProviders.join(', ')} that are not linked to a game are not in this list. The full list is in the app: Profile → Connected clubs.`,
            }),
      },
      summary: agentBookingT(ctx.locale, list.listComplete ? 'summary.bookings' : 'summary.bookingsPartial', {
        count: list.items.length,
      }),
      entities,
    };
  },
});

export const BOOKING_TOOLS = [listMyBookingsTool];
