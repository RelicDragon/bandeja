import type { Game } from '@/types';

export type MatchTimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';

export type MatchTimerAction = 'start' | 'pause' | 'resume' | 'stop' | 'reset';

export interface MatchTimerSnapshot {
  status: MatchTimerStatus;
  startedAt: string | null;
  pausedAt: string | null;
  elapsedMs: number;
  capMinutes: number | null;
  serverNow: string;
  expiresAt: string | null;
  capJustNotified?: boolean;
}

const TIMED = new Set(['TIMED', 'CLASSIC_TIMED']);

export function isGameMatchTimerEnabled(game: Pick<Game, 'scoringPreset' | 'matchTimedCapMinutes'> | null | undefined): boolean {
  if (!game?.scoringPreset) return false;
  if (!TIMED.has(game.scoringPreset)) return false;
  const cap = game.matchTimedCapMinutes ?? 0;
  return cap >= 1;
}

function computeElapsedFromFields(
  status: MatchTimerStatus,
  startedAt: string | null,
  baseElapsedMs: number,
  nowMs: number
): number {
  let ms = baseElapsedMs;
  if (status === 'RUNNING' && startedAt) {
    const t0 = Date.parse(startedAt);
    if (!Number.isNaN(t0)) ms += Math.max(0, nowMs - t0);
  }
  return Math.max(0, ms);
}

export function buildSnapshotFromServerMatch(match: {
  timerStatus?: MatchTimerStatus | string;
  timerStartedAt?: string | Date | null;
  timerPausedAt?: string | Date | null;
  timerElapsedMs?: number;
  timerCapMinutes?: number | null;
}): MatchTimerSnapshot | undefined {
  const status = match.timerStatus as MatchTimerStatus | undefined;
  if (!status) return undefined;
  const toIso = (v: string | Date | null | undefined) => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    return v.toISOString();
  };
  const startedAt = toIso(match.timerStartedAt ?? null);
  const pausedAt = toIso(match.timerPausedAt ?? null);
  const capMinutes = match.timerCapMinutes ?? null;
  const baseElapsed = match.timerElapsedMs ?? 0;
  const nowMs = Date.now();
  const elapsedMs = computeElapsedFromFields(status, startedAt, baseElapsed, nowMs);
  const capMs = capMinutes != null && capMinutes > 0 ? capMinutes * 60_000 : 0;
  const remaining =
    capMs > 0 && status === 'RUNNING' ? Math.max(0, capMs - elapsedMs) : null;
  const serverNow = new Date(nowMs).toISOString();
  return {
    status,
    startedAt,
    pausedAt,
    elapsedMs,
    capMinutes,
    serverNow,
    expiresAt:
      remaining != null && status === 'RUNNING'
        ? new Date(nowMs + remaining).toISOString()
        : null,
  };
}

export function formatMatchTimerMs(totalMs: number): string {
  const s = Math.floor(totalMs / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function applyOptimisticTimerTransition(
  prev: MatchTimerSnapshot | undefined,
  action: MatchTimerAction,
  capMinutes: number,
  nowMs: number
): MatchTimerSnapshot {
  const iso = (ms: number) => new Date(ms).toISOString();
  const cap = capMinutes > 0 ? capMinutes : null;
  const base = prev ?? {
    status: 'IDLE' as const,
    startedAt: null,
    pausedAt: null,
    elapsedMs: 0,
    capMinutes: cap,
    serverNow: iso(nowMs),
    expiresAt: null,
  };

  switch (action) {
    case 'start':
      return {
        status: 'RUNNING',
        startedAt: iso(nowMs),
        pausedAt: null,
        elapsedMs: 0,
        capMinutes: cap,
        serverNow: iso(nowMs),
        expiresAt: cap ? new Date(nowMs + cap * 60_000).toISOString() : null,
      };
    case 'pause': {
      if (base.status !== 'RUNNING' || !base.startedAt) return base;
      const t0 = Date.parse(base.startedAt);
      const slice = Number.isNaN(t0) ? 0 : Math.max(0, nowMs - t0);
      return {
        status: 'PAUSED',
        startedAt: null,
        pausedAt: iso(nowMs),
        elapsedMs: base.elapsedMs + slice,
        capMinutes: base.capMinutes,
        serverNow: iso(nowMs),
        expiresAt: null,
      };
    }
    case 'resume':
      if (base.status !== 'PAUSED') return base;
      return {
        status: 'RUNNING',
        startedAt: iso(nowMs),
        pausedAt: null,
        elapsedMs: base.elapsedMs,
        capMinutes: base.capMinutes,
        serverNow: iso(nowMs),
        expiresAt: base.capMinutes
          ? new Date(nowMs + Math.max(0, base.capMinutes * 60_000 - base.elapsedMs)).toISOString()
          : null,
      };
    case 'stop': {
      let elapsed = base.elapsedMs;
      if (base.status === 'RUNNING' && base.startedAt) {
        const t0 = Date.parse(base.startedAt);
        if (!Number.isNaN(t0)) elapsed += Math.max(0, nowMs - t0);
      }
      return {
        status: 'STOPPED',
        startedAt: null,
        pausedAt: null,
        elapsedMs: Math.max(0, elapsed),
        capMinutes: base.capMinutes,
        serverNow: iso(nowMs),
        expiresAt: null,
      };
    }
    case 'reset':
      return {
        status: 'IDLE',
        startedAt: null,
        pausedAt: null,
        elapsedMs: 0,
        capMinutes: null,
        serverNow: iso(nowMs),
        expiresAt: null,
      };
    default:
      return base;
  }
}

export function liveElapsedMs(snapshot: MatchTimerSnapshot, nowMs: number): number {
  return computeElapsedFromFields(snapshot.status, snapshot.startedAt, snapshot.elapsedMs, nowMs);
}
