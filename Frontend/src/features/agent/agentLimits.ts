import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { formatGameTime, resolveDisplaySettings } from '@/utils/displayPreferences';
import type { AgentLimitCode } from './agentErrors';

const HOUR_MS = 60 * 60_000;
/** setTimeout's ceiling (~24.8 days); longer waits re-arm. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** A limit the chat hit: from a refused send (429) or a `run.failed` event. */
export interface AgentLimit {
  code: AgentLimitCode;
  /** ISO time the limit lifts; null when the server did not say. */
  retryAt: string | null;
}

/** "12:05" / "0:42" countdown (minutes:seconds), for waits under an hour. */
export function formatAgentCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Live clock for a limit's `retryAt`: `active` until it passes (then the composer re-enables
 * by itself). Ticks every second only in the last hour, where the countdown shows; before
 * that it sleeps until the countdown starts. No `retryAt` → never active.
 */
export function useAgentLimitClock(retryAt: string | null): { active: boolean; msLeft: number } {
  const target = retryAt ? Date.parse(retryAt) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let timer: number | undefined;
    const arm = () => {
      const current = Date.now();
      setNow(current);
      const left = target - current;
      if (left <= 0) return;
      const wait = left <= HOUR_MS ? Math.min(1000, left) : Math.min(MAX_TIMEOUT_MS, left - HOUR_MS + 50);
      timer = window.setTimeout(arm, wait);
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [target]);

  if (!Number.isFinite(target)) return { active: false, msLeft: 0 };
  const msLeft = Math.max(0, target - now);
  return { active: msLeft > 0, msLeft };
}

export const AGENT_LIMIT_COUNTDOWN_MS = HOUR_MS;

/** A limit's reset time in the user's 12 / 24 h setting (same as the context sheet). */
export function useAgentResetTime(retryAt: string | null): string | null {
  const user = useAuthStore((state) => state.user);
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  return retryAt ? formatGameTime(retryAt, settings) : null;
}
