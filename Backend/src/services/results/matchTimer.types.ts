import { MatchTimerStatus } from '@prisma/client';

export type MatchTimerSnapshotJson = {
  status: MatchTimerStatus;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedMs: number;
  capMinutes: number | null;
  serverNow: string;
  expiresAt: string | null;
  capJustNotified?: boolean;
};

export type MatchTimerAction = 'start' | 'pause' | 'resume' | 'stop' | 'reset';
