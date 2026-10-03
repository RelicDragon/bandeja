import { describe, expect, it } from 'vitest';
import type { AgentChatUsageDto } from '@shared/agentContract';
import { agentContextLevel, agentContextRatio } from './agentContextUsage';

const usage = (contextTokens: number, contextWindowTokens = 1000): AgentChatUsageDto => ({
  contextTokens,
  contextWindowTokens,
  dailyUsedTokens: 0,
  dailyBudgetTokens: 1,
  dailyResetsAt: '2026-10-04T00:00:00.000Z',
});

describe('agent context usage', () => {
  it('clamps the ratio and survives a zero window', () => {
    expect(agentContextRatio(usage(250))).toBe(0.25);
    expect(agentContextRatio(usage(5000))).toBe(1);
    expect(agentContextRatio(usage(10, 0))).toBe(0);
  });

  it('turns yellow at 50% and red at 75%', () => {
    expect(agentContextLevel(0.49)).toBe('ok');
    expect(agentContextLevel(0.5)).toBe('warn');
    expect(agentContextLevel(0.74)).toBe('warn');
    expect(agentContextLevel(0.75)).toBe('critical');
  });
});
