/**
 * One consumer's view of a run's event log: replay after a cursor, then live events, in id
 * order and without duplicates, ending after the terminal event. Shared by the SSE route
 * (`GET /api/agent/runs/:runId/events`) and the Telegram assistant
 * (`services/telegram/agent/`), so both channels see identical streams.
 *
 * - Log present (or re-openable for a QUEUED/RUNNING run): subscribe first, read the
 *   backlog, flush whatever arrived meanwhile, then stream live.
 * - Log gone and the run finished: replay from the database (`buildSyntheticEvents`).
 * - While open, a keepalive tick asks the service to reconcile: if the DB says the run
 *   ended (or its executor went stale) but the log has no terminal event, one is appended
 *   so the feed still ends.
 */
import type { AgentRun } from '@prisma/client';
import type { AgentStreamEvent } from '@bandeja/shared/agentContract';
import {
  type AgentEventStore,
  type AgentStoredEvent,
  buildSyntheticAgentReplay,
  isTerminalAgentEvent,
} from './agentEvents';

/** What the feed needs from `AgentRunService` (a fake in tests). */
export interface AgentRunFeedSource {
  readonly events: AgentEventStore;
  ensureLiveLog(run: AgentRun): Promise<boolean>;
  buildSyntheticEvents(run: AgentRun): Promise<AgentStreamEvent[]>;
  reconcileTerminal(runId: string): Promise<void>;
}

export type AgentRunFeedOptions = {
  source: AgentRunFeedSource;
  run: AgentRun;
  /** Replay cursor: events with id > after. 0 = everything. */
  after: number;
  onEvent: (stored: AgentStoredEvent) => void;
  /** Called once, after the terminal event or `close()`. */
  onEnd?: () => void;
  keepaliveMs: number;
  onKeepalive?: () => void;
  /** Re-read of the run row for the database replay path (defaults to `run`). */
  reloadRun?: (runId: string) => Promise<AgentRun | null>;
};

export class AgentRunFeed {
  private closed = false;
  private lastDelivered: number;
  private unsubscribe: () => void = () => {};
  private keepalive: NodeJS.Timeout | null = null;

  constructor(private readonly options: AgentRunFeedOptions) {
    this.lastDelivered = options.after;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    this.options.onEnd?.();
  }

  private deliver(stored: AgentStoredEvent): void {
    if (this.closed || stored.id <= this.lastDelivered) return;
    this.lastDelivered = stored.id;
    this.options.onEvent(stored);
    if (isTerminalAgentEvent(stored.event)) this.close();
  }

  async start(): Promise<void> {
    const { source, run, after } = this.options;
    const store = source.events;
    const live = (await store.has(run.id)) || (await source.ensureLiveLog(run));
    if (this.closed) return;
    if (!live) {
      const fresh = (await this.options.reloadRun?.(run.id)) ?? run;
      const events = await source.buildSyntheticEvents(fresh);
      for (const stored of buildSyntheticAgentReplay(events, after)) this.deliver(stored);
      this.close();
      return;
    }

    let replaying = true;
    const buffered: AgentStoredEvent[] = [];
    // Subscribe before reading so nothing falls between the replay and the live feed.
    this.unsubscribe = store.subscribe(run.id, (stored) => {
      if (replaying) buffered.push(stored);
      else this.deliver(stored);
    });
    if (this.closed) {
      this.unsubscribe();
      return;
    }
    for (const stored of await store.read(run.id, after)) this.deliver(stored);
    replaying = false;
    for (const stored of buffered.sort((a, b) => a.id - b.id)) this.deliver(stored);
    if (this.closed) return;

    this.keepalive = setInterval(() => {
      if (this.closed) return;
      this.options.onKeepalive?.();
      void source
        .reconcileTerminal(run.id)
        .catch((error) => console.error('[agent] reconcile failed', { runId: run.id, error }));
    }, this.options.keepaliveMs);
    this.keepalive.unref?.();
  }
}
