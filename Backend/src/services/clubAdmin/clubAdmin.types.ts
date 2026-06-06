import { CourtSlotHoldLabel, EntityType, GameStatus } from '@prisma/client';

export type ScheduleSlot =
  | {
      type: 'game';
      gameId: string;
      courtId: string | null;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      status: GameStatus;
      entityType: EntityType;
      name: string | null;
      host: { id: string; firstName: string | null; lastName: string | null; avatar: string | null };
      participantCount: number;
    }
  | {
      type: 'game_court';
      gameId: string;
      courtId: string;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      status: GameStatus;
      entityType: EntityType;
      name: string | null;
      host: { id: string; firstName: string | null; lastName: string | null; avatar: string | null };
      participantCount: number;
    }
  | {
      type: 'external';
      courtId: string;
      courtName: string | null;
      startTime: string;
      endTime: string;
    }
  | {
      type: 'hold';
      holdId: string;
      courtId: string;
      label: CourtSlotHoldLabel;
      note: string | null;
      startTime: string;
      endTime: string;
    };

export interface ScheduleConflict {
  courtId: string;
  startTime: string;
  endTime: string;
  kinds: Array<'game' | 'game_court' | 'external' | 'hold'>;
}

export type ClubAdminReservationItem =
  | {
      kind: 'game';
      id: string;
      gameId: string;
      courtId: string | null;
      courtName: string | null;
      startTime: string;
      endTime: string;
      hasBookedCourt: boolean;
      status: GameStatus;
      name: string | null;
      host: { id: string; firstName: string | null; lastName: string | null; avatar: string | null };
      participantCount: number;
    }
  | {
      kind: 'hold';
      id: string;
      holdId: string;
      courtId: string;
      courtName: string | null;
      startTime: string;
      endTime: string;
      label: CourtSlotHoldLabel;
      note: string | null;
    };

export interface ClubAdminReservationsResponse {
  items: ClubAdminReservationItem[];
  hasMore: boolean;
}

export interface ClubAdminClubListItem {
  id: string;
  name: string;
  avatar: string | null;
  address: string;
  openingTime: string | null;
  closingTime: string | null;
  city: { id: string; name: string; timezone: string };
  courtsCount: number;
  bookingsToday: number;
  integrationScriptName: string | null;
}

export interface ClubAdminClubsListResponse {
  items: ClubAdminClubListItem[];
  hasMore: boolean;
  total: number;
}
