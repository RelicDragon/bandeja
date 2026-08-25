import { isAxiosError } from 'axios';
import { useGameSlotOverlapConfirmStore } from '@/store/gameSlotOverlapConfirmStore';

export type OverlappingGameSlot = {
  id: string;
  name: string | null;
  startTime: string;
  endTime: string;
};

export function isOverlapConfirmRequired(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const data = error.response?.data as { requiresOverlapConfirm?: unknown } | undefined;
  return error.response?.status === 409 && data?.requiresOverlapConfirm === true;
}

export function overlapConfirmBody(confirmOverlap: boolean): { confirmOverlap: true } | Record<string, never> {
  return confirmOverlap ? { confirmOverlap: true } : {};
}

export async function runWithOverlapConfirm<T>(
  action: (confirmOverlap: boolean) => Promise<T>,
  options?: { beforeAsk?: () => void; beforeRetry?: () => void },
): Promise<T | undefined> {
  try {
    return await action(false);
  } catch (error) {
    if (!isOverlapConfirmRequired(error)) throw error;
    options?.beforeAsk?.();
    const confirmed = await useGameSlotOverlapConfirmStore.getState().ask();
    if (!confirmed) return undefined;
    options?.beforeRetry?.();
    return await action(true);
  }
}
