export function createStats() {
  return {
    tavilySearches: 0,
    tavilyExtracts: 0,
    tavilyCredits: 0,
    openaiCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
}

export function addTavilySearch(stats, usage = null) {
  stats.tavilySearches += 1;
  if (usage?.credits != null) stats.tavilyCredits += usage.credits;
  else stats.tavilyCredits += 1;
}

export function addTavilyExtract(stats, usage = null) {
  stats.tavilyExtracts += 1;
  if (usage?.credits != null) stats.tavilyCredits += usage.credits;
  else stats.tavilyCredits += 1;
}

export function addOpenAIUsage(stats, usage) {
  if (!usage) return;
  stats.openaiCalls += 1;
  stats.promptTokens += usage.prompt_tokens ?? 0;
  stats.completionTokens += usage.completion_tokens ?? 0;
}
