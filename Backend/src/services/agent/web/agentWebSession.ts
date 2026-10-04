/**
 * Per-run state of the web tools: the
 * per-run call counts and the canonical URLs this run's searches returned (so a fetch in
 * the same step is allowed before the TOOL message is saved). In memory: RUNNING runs are
 * never re-executed, so the state can't outlive its run.
 */
export type AgentWebRunSession = {
  searches: number;
  fetches: number;
  /** Canonical URLs (`canonicalizeUrl`) returned by `web_search` in this run. */
  allowedUrls: Set<string>;
};

export function createAgentWebRunSession(): AgentWebRunSession {
  return { searches: 0, fetches: 0, allowedUrls: new Set() };
}
