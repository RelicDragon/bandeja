import { useEffect, useState } from 'react';

const listeners = new Set<() => void>();
let showAward = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
  if (intervalId != null) return;
  intervalId = setInterval(() => {
    showAward = !showAward;
    for (const listener of listeners) listener();
  }, 1500);
}

function stopTickerIfIdle() {
  if (listeners.size > 0 || intervalId == null) return;
  clearInterval(intervalId);
  intervalId = null;
}

/** One shared 1.5s flip for all place cells — only subscribed cells re-render. */
export function useStandingsAwardFlip(enabled: boolean): boolean {
  const [show, setShow] = useState(showAward);

  useEffect(() => {
    if (!enabled) return;
    ensureTicker();
    const onTick = () => setShow(showAward);
    listeners.add(onTick);
    setShow(showAward);
    return () => {
      listeners.delete(onTick);
      stopTickerIfIdle();
    };
  }, [enabled]);

  return enabled ? show : false;
}
