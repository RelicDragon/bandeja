import { isAxiosError } from 'axios';

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
