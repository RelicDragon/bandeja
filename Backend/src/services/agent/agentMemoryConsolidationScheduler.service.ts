import * as cron from 'node-cron';
import { config } from '../../config/env';
import { logLlmUsage } from '../ai/llmUsageLog.service';
import { runAgentMemoryConsolidation } from './agentMemoryConsolidation.service';
import { getDefaultAgentLlmClient } from './llm/deepseekStream';

/**
 * Phase 11.4 weekly memory consolidation (`agentMemoryConsolidation.service.ts`). Runs daily
 * at 03:40; each user is due once a week, and only when their notes changed. The global
 * daily LLM cap is `AGENT_MEMORY_CONSOLIDATION_DAILY_CAP`. Re-entrancy guarded like the other
 * schedulers; the cron callback never throws. Multi-process safe (per-user claim).
 */
export class AgentMemoryConsolidationScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    this.cronJob = cron.schedule('40 3 * * *', () => void this.runOnce());
    console.log('🧠 Agent memory consolidation scheduler started (daily 03:40, weekly per user)');
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const agentConfig = config.agent;
      const llm = getDefaultAgentLlmClient({
        apiKey: config.deepseek.apiKey,
        baseUrl: agentConfig.baseUrl,
        model: agentConfig.model,
      });
      const { reports, capReached } = await runAgentMemoryConsolidation({
        now: new Date(),
        llm,
        dailyCap: agentConfig.memoryConsolidationDailyCap,
        logUsage: logLlmUsage,
      });
      if (reports.length > 0 || capReached) {
        const removed = reports.reduce((n, r) => n + r.deduped + r.dropped, 0);
        const merged = reports.reduce((n, r) => n + r.merged, 0);
        console.log(
          `🧠 Memory consolidation: ${reports.length} user(s), ${merged} merge(s), ${removed} note(s) removed${capReached ? ' (daily cap reached)' : ''}`,
        );
      }
    } catch (error) {
      console.error('[AgentMemoryConsolidationScheduler] error:', error);
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.cronJob?.stop();
    this.cronJob = null;
    console.log('🛑 Agent memory consolidation scheduler stopped');
  }
}
