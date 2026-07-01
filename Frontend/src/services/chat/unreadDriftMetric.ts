const SAMPLE_RATE = import.meta.env.PROD ? 0.01 : 1;

export function sampleUnreadTotalsDrift(clientTotal: number, serverTotal: number | undefined): void {
  if (serverTotal == null) return;
  const drift = Math.abs(clientTotal - serverTotal);
  if (drift === 0) return;
  if (Math.random() >= SAMPLE_RATE) return;
  if (import.meta.env.PROD) {
    console.info('[unreadDrift]', { clientTotal, serverTotal, drift });
  }
}
