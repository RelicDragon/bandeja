/**
 * Agent DTO and entity ref of a booking (docs/plans/ai-agent-booking.md §14.6–14.7).
 * Only the server-minted `ref`: never the provider booking id, court external ids or tokens.
 */
import { formatInTimeZone } from 'date-fns-tz';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import type { AgentBookingItem } from '../booking/agentBookingSources';

const LOCAL_FORMAT = 'yyyy-MM-dd HH:mm';

export function toAgentBookingDto(item: AgentBookingItem) {
  return {
    bookingRef: item.ref,
    provider: item.provider,
    clubId: item.clubId,
    clubName: item.clubName,
    courtNames: item.courtNames,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    /** Wall clock in the club's city timezone. */
    localStart: formatInTimeZone(item.start, item.timeZone, LOCAL_FORMAT),
    localEnd: formatInTimeZone(item.end, item.timeZone, LOCAL_FORMAT),
    timeZone: item.timeZone,
    state: item.state,
    linkedGameIds: item.linkedGameIds,
    canCancel: item.canCancel,
  };
}

export function agentBookingEntity(item: AgentBookingItem): AgentEntityRef {
  return {
    type: 'booking',
    ref: item.ref,
    clubId: item.clubId,
    clubName: item.clubName,
    courtNames: item.courtNames,
    start: item.start.toISOString(),
    end: item.end.toISOString(),
    timeZone: item.timeZone,
    provider: item.provider,
    state: item.state,
    linkedGameIds: item.linkedGameIds,
    canCancel: item.canCancel,
  };
}
