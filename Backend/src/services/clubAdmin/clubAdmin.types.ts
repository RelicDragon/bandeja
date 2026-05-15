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
