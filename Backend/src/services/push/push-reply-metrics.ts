type PushReplyMetricKey = 'success' | 'invalidToken' | 'forbidden' | 'rateLimited' | 'error';

const counters: Record<PushReplyMetricKey, number> = {
  success: 0,
  invalidToken: 0,
  forbidden: 0,
  rateLimited: 0,
  error: 0,
};

export function recordPushReplyMetric(key: PushReplyMetricKey): void {
  counters[key] += 1;
}

export function getPushReplyMetrics(): Readonly<Record<PushReplyMetricKey, number>> {
  return { ...counters };
}

export function resetPushReplyMetricsForTests(): void {
  for (const key of Object.keys(counters) as PushReplyMetricKey[]) {
    counters[key] = 0;
  }
}
