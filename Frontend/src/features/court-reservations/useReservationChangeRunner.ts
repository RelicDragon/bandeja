/**
 * React wrapper around {@link runReservationChanges}: one run per game,
 * journaled to localStorage (and mirrored to the server journal when given),
 * so a killed app — or another device — can offer "Finish changes".
 *
 * Executors are injected; production code builds them with
 * `createReservationExecutors(env, defaultReservationExecutorDeps())`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import type { PlanStep } from '@shared/gameBooking/planReschedule';
import {
  activeRunOf,
  createRunJournal,
  flushRunMirror,
  isUnfinished,
  rollbackReservationChanges,
  runReservationChanges,
  type ActiveRunRef,
  type ReservationExecutors,
  type RunJournal,
  type RunJournalStore,
  type RunnerDeps,
  type ServerRunJournal,
} from './reservationRunner';
import { journalFromServerRun } from './reservationExecutors';
import { createRunJournalStore } from './runJournalStorage';
import type { ReservationChange } from '@/api/courtSlots';

export type UseReservationChangeRunnerOptions = {
  gameId: string;
  executors: ReservationExecutors;
  canCancel: (provider: string) => boolean;
  server?: ServerRunJournal;
  store?: RunJournalStore;
  /** Another device's unfinished run (`GET /games/:id/reservation-changes/active`), used when this device has none. */
  loadServerJournal?: () => Promise<RunJournal | null>;
  /**
   * Rebuild a runnable journal from the active run the server reported with
   * its 409 (`journalFromServerRun`). Falls back to `loadServerJournal`.
   */
  journalFromActiveRun?: (active: ActiveRunRef) => RunJournal | null;
  /** After a run settles (refresh the game). */
  onSettled?: (journal: RunJournal) => void;
};

export function useReservationChangeRunner(options: UseReservationChangeRunnerOptions) {
  const { gameId } = options;
  const store = useMemo(() => options.store ?? createRunJournalStore(), [options.store]);
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const [journal, setJournal] = useState<RunJournal | null>(() => store.load(gameId));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    setJournal(store.load(gameId));
  }, [gameId, store]);

  const deps = useCallback(
    (): RunnerDeps => ({
      executors: optsRef.current.executors,
      canCancel: optsRef.current.canCancel,
      server: optsRef.current.server,
      store,
      onUpdate: setJournal,
    }),
    [store],
  );

  const execute = useCallback(
    async (work: () => Promise<RunJournal>) => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await work();
        setJournal(result);
        optsRef.current.onSettled?.(result);
        return result;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  /** Replace any finished journal with a fresh run of `steps`. */
  const start = useCallback(
    (steps: readonly PlanStep[], windows: { from?: IsoInterval | null; to?: IsoInterval | null } = {}) => {
      const fresh = createRunJournal(gameId, steps, { targetWindow: windows.to, fromWindow: windows.from });
      store.save(fresh);
      setJournal(fresh);
      return execute(() => runReservationChanges(fresh, deps()));
    },
    [deps, execute, gameId, store],
  );

  const resume = useCallback(() => {
    const current = store.load(gameId) ?? journal;
    if (!current) return Promise.resolve(null);
    return execute(() => runReservationChanges(current, deps()));
  }, [deps, execute, gameId, journal, store]);

  const undo = useCallback(() => {
    const current = store.load(gameId) ?? journal;
    if (!current) return Promise.resolve(null);
    return execute(() => rollbackReservationChanges(current, deps()));
  }, [deps, execute, gameId, journal, store]);

  /**
   * "Finish it": the server refused a new run because another one (ours) is
   * running — adopt that run and finish it instead.
   */
  const resumeActive = useCallback(async () => {
    const active = activeRunOf(journal);
    const rebuild =
      optsRef.current.journalFromActiveRun ?? ((ref: ActiveRunRef) => journalFromServerRun(gameId, ref as unknown as ReservationChange));
    let remote: RunJournal | null = active ? rebuild(active) : null;
    if (!remote && optsRef.current.loadServerJournal) remote = await optsRef.current.loadServerJournal().catch(() => null);
    if (!remote || !isUnfinished(remote)) return null;
    store.save(remote);
    setJournal(remote);
    return execute(() => runReservationChanges(remote, deps()));
  }, [deps, execute, gameId, journal, store]);

  const dismiss = useCallback(() => {
    store.clear(gameId);
    setJournal(null);
  }, [gameId, store]);

  // Mirror writes that failed offline; and another device's unfinished run.
  useEffect(() => {
    let cancelled = false;
    const local = store.load(gameId);
    if (local && local.mirrorQueue.length > 0 && optsRef.current.server) {
      void flushRunMirror(local, deps()).then((j) => {
        if (!cancelled) setJournal(j);
      });
    } else if (!local && optsRef.current.loadServerJournal) {
      void optsRef.current
        .loadServerJournal()
        .then((remote) => {
          if (!cancelled && remote && isUnfinished(remote)) {
            store.save(remote);
            setJournal(remote);
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [deps, gameId, store]);

  return {
    journal,
    busy,
    /** A run was left running/paused (app killed, or another device). */
    unfinished: !busy && isUnfinished(journal),
    start,
    resume,
    resumeActive,
    undo,
    dismiss,
  };
}

export type ReservationChangeRunner = ReturnType<typeof useReservationChangeRunner>;
