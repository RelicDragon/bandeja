/**
 * Provider rotation (docs/plans/ai-agent-web-search.md §13.4). travel-bandeja is "first
 * healthy wins", so with two keys one provider serves everything. Here:
 *
 *   - `lru` (default): healthy candidates by least-recently-attempted first (a process-wide
 *     sequence stamped when a provider is attempted, so concurrent searches alternate too);
 *     never-used ties keep the configured order. Two healthy providers strictly alternate.
 *   - `ordered`: the configured order (travel-bandeja).
 *
 * Cooling candidates go after the healthy ones only so the chain can report them as
 * `cooldown` in `tried`; it never calls them. The keyless fallback is appended by the
 * chain, never rotated in.
 */
import type { AgentWebRotation } from '../../../../config/agentWebEnv';

export class ProviderRotation {
  private seq = 0;
  private readonly lastUsed = new Map<string, number>();

  order(candidates: readonly string[], strategy: AgentWebRotation, isHealthy: (name: string) => boolean): string[] {
    const healthy = candidates.filter((name) => isHealthy(name));
    const cooling = candidates.filter((name) => !isHealthy(name));
    if (strategy === 'ordered') return [...healthy, ...cooling];
    const rank = new Map(candidates.map((name, index) => [name, index]));
    const sorted = [...healthy].sort((a, b) => {
      const diff = (this.lastUsed.get(a) ?? 0) - (this.lastUsed.get(b) ?? 0);
      return diff !== 0 ? diff : (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
    });
    return [...sorted, ...cooling];
  }

  markAttempt(name: string): void {
    this.seq += 1;
    this.lastUsed.set(name, this.seq);
  }

  clear(): void {
    this.seq = 0;
    this.lastUsed.clear();
  }
}
