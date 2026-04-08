import toast from 'react-hot-toast';
import type { TFunction } from 'i18next';

export function toastApiError(t: TFunction, e: unknown, fallbackKey = 'errors.generic') {
  const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
  toast.error(msg ? t(msg, { defaultValue: msg }) : t(fallbackKey));
}
