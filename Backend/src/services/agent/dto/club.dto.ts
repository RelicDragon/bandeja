/**
 * Agent-facing club / city shapes. Business data the public club page shows
 * (`clubPublic.projection.ts`), minus operator fields (`integrationConfig`, `ptMeta`,
 * external court ids) and photos.
 */
import type { Prisma } from '@prisma/client';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import { truncateUserText } from './game.dto';

export const AGENT_CLUB_SUMMARY_SELECT = {
  id: true,
  name: true,
  address: true,
  isBar: true,
  isForPlaying: true,
  sports: true,
  courtsNumber: true,
  clubRating: true,
  clubReviewCount: true,
  city: { select: { id: true, name: true } },
} satisfies Prisma.ClubSelect;

export type AgentClubSummaryRow = Prisma.ClubGetPayload<{ select: typeof AGENT_CLUB_SUMMARY_SELECT }>;

export function toAgentClubSummary(row: AgentClubSummaryRow) {
  return {
    clubId: row.id,
    name: row.name,
    address: row.address,
    cityId: row.city.id,
    cityName: row.city.name,
    isBar: row.isBar,
    isForPlaying: row.isForPlaying,
    sports: row.sports,
    courtsNumber: row.courtsNumber,
    rating: row.clubRating,
    reviewCount: row.clubReviewCount,
  };
}

export function agentClubEntity(row: { id: string; name: string; city: { name: string } | null }): AgentEntityRef {
  return { type: 'club', id: row.id, name: row.name, cityName: row.city?.name ?? null };
}

export const AGENT_CLUB_DETAIL_SELECT = {
  ...AGENT_CLUB_SUMMARY_SELECT,
  isActive: true,
  description: true,
  phone: true,
  website: true,
  openingTime: true,
  closingTime: true,
  defaultSlotMinutes: true,
  cancellationNoticeHours: true,
  city: { select: { id: true, name: true, timezone: true } },
  courts: {
    where: { isActive: true },
    select: { id: true, name: true, sport: true, courtType: true, isIndoor: true, pricePerHour: true },
    orderBy: { name: 'asc' },
  },
} satisfies Prisma.ClubSelect;

export type AgentClubDetailRow = Prisma.ClubGetPayload<{ select: typeof AGENT_CLUB_DETAIL_SELECT }>;

export function toAgentClubDetail(row: AgentClubDetailRow) {
  return {
    ...toAgentClubSummary(row),
    cityTimezone: row.city.timezone,
    description: truncateUserText(row.description),
    contactPhone: row.phone ?? null,
    website: row.website ?? null,
    openingTime: row.openingTime ?? null,
    closingTime: row.closingTime ?? null,
    defaultSlotMinutes: row.defaultSlotMinutes ?? null,
    cancellationNoticeHours: row.cancellationNoticeHours ?? null,
    courts: row.courts.map((court) => ({
      courtId: court.id,
      name: court.name,
      sport: court.sport,
      type: court.courtType,
      isIndoor: court.isIndoor,
      pricePerHour: court.pricePerHour,
    })),
  };
}
