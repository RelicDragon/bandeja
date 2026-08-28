import { openExternalUrl } from './openExternalUrl';
import { buildTelegramUserOpenPlan, type TelegramContact } from './telegramUserUrl';

export const TELEGRAM_PROTOCOL_HANDOFF_MS = 1500;

function waitForProtocolHandoff(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (handedOff: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('blur', onHandoff);
      window.removeEventListener('pagehide', onHandoff);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(timer);
      resolve(handedOff);
    };
    const onHandoff = () => finish(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') finish(true);
    };
    window.addEventListener('blur', onHandoff);
    window.addEventListener('pagehide', onHandoff);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

export async function openTelegramUser(opts: TelegramContact): Promise<void> {
  const plan = buildTelegramUserOpenPlan(opts);
  if (!plan) return;
  if (!plan.webFallback) {
    await openExternalUrl(plan.url);
    return;
  }

  const handoff = waitForProtocolHandoff(TELEGRAM_PROTOCOL_HANDOFF_MS);
  await openExternalUrl(plan.url);
  if (!(await handoff)) {
    await openExternalUrl(plan.webFallback);
  }
}
