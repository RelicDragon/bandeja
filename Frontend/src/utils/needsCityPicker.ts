import type { User } from '@/types';

/** Full /select-city picker — only after sport gate, when auto-assign left no currentCity. */
export function needsCityPicker(user: User | null | undefined): boolean {
  if (user == null || user.nameIsSet !== true) return false;
  if (user.primarySportIsSet !== true) return false;
  return user.currentCity == null;
}
