import i18n from 'i18next';
import toast from 'react-hot-toast';
import {
  clubAdminErrorMessageKey,
  parseClubAdminError,
  type ClubAdminErrorSuffix,
} from '@/api/clubAdminErrors';

/**
 * Toast an operator-facing message for a failed club admin call (`code` → `errors.*` in the
 * club admin namespace). Uses the global i18next instance so light modules (forms) can import it.
 */
export function toastClubAdminError(err: unknown, silentCodes: readonly ClubAdminErrorSuffix[] = []): void {
  const parsed = parseClubAdminError(err);
  if (parsed.aborted) return;
  if (parsed.suffix && silentCodes.includes(parsed.suffix)) return;
  toast.error(i18n.t(clubAdminErrorMessageKey(err), { ns: 'clubAdmin' }), { id: `club-admin-error:${parsed.suffix ?? parsed.status}` });
}
