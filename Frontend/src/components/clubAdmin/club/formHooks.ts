import { parseClubAdminError } from '@/api/clubAdminErrors';
import type { ClubAdminValidationDetail } from '@shared/clubAdmin/contract';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

/** Bottom padding so the last field can scroll above the save bar and the software keyboard. */
export function useFormBottomPadding(dirty: boolean): number {
  const keyboard = useKeyboardInset();
  return (dirty ? 96 : 32) + (keyboard.visible ? keyboard.insetPx : 0);
}

/** `clubAdmin.validation` details as `{ field: message }` (null for any other error). */
export function validationFieldErrors(err: unknown): Record<string, string> | null {
  const parsed = parseClubAdminError(err);
  if (parsed.suffix !== 'validation') return null;
  const out: Record<string, string> = {};
  const details = Array.isArray(parsed.details) ? (parsed.details as ClubAdminValidationDetail[]) : [];
  for (const d of details) {
    if (d && typeof d.field === 'string') out[d.field] = typeof d.message === 'string' ? d.message : '';
  }
  return out;
}
