/**
 * Per-club console context: who I am here (role, capabilities), the club time zone, and the
 * club-local "today" — recomputed every minute from the device instant in the **club** zone, so
 * a console left open across midnight rolls over with the club, not the device.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { clubLocalDate } from '@shared/clubAdmin/clubTime';
import type { ConsoleContext } from '@/queries/clubAdmin';
import { ClubConsoleCtx, type ClubConsoleValue } from './clubConsoleContextValue';

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 60_000 - (Date.now() % 60_000) + 50;
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, ms);
    };
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

export function ClubConsoleProvider({ context, children }: { context: ConsoleContext; children: ReactNode }) {
  const nowMs = useMinuteClock();
  const timeZone = context.club.timezone;
  const today = useMemo(() => clubLocalDate(new Date(nowMs), timeZone), [nowMs, timeZone]);
  const value = useMemo<ClubConsoleValue>(
    () => ({
      clubId: context.club.id,
      context,
      timeZone,
      today,
      nowMs,
      can: (c) => context.capabilities.includes(c),
      isV2: context.apiVersion === 'v2',
    }),
    [context, timeZone, today, nowMs]
  );
  return <ClubConsoleCtx.Provider value={value}>{children}</ClubConsoleCtx.Provider>;
}
