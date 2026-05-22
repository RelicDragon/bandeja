import type { BasicUser } from '@/types';

export type RallyCourtProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  teamAScore: number;
  teamBScore: number;
  className?: string;
};
