/**
 * "Needs attention" inbox: each `AttentionItem` becomes an actionable row that links where the
 * operator fixes it. Rows the role cannot act on are dropped; `setup` is dropped because the
 * setup checklist card owns it.
 */
import type { AttentionItem, ClubAdminCapability, ClubSetupChecklist } from '@shared/clubAdmin/contract';
import { consoleBase, type ClubPageId } from '@/clubAdmin/consoleNav';

export type AttentionIcon = 'conflict' | 'sync' | 'courts' | 'court' | 'money' | 'reviews';

export interface AttentionRowModel {
  id: string;
  icon: AttentionIcon;
  tone: 'warn' | 'danger' | 'info';
  /** Key under attention.* in the club admin namespace + interpolation values. */
  titleKey: string;
  values: Record<string, string | number>;
  /** Amounts to format with the money formatter. */
  amount?: { cents: number; currency: string };
  to: string | null;
}

export function attentionRows(
  items: AttentionItem[],
  clubId: string,
  can: (c: ClubAdminCapability) => boolean
): AttentionRowModel[] {
  const base = consoleBase(clubId);
  const out: AttentionRowModel[] = [];
  for (const item of items) {
    switch (item.kind) {
      case 'conflict':
        out.push({
          id: `conflict:${item.date}`,
          icon: 'conflict',
          tone: 'danger',
          titleKey: 'attention.conflict',
          values: { count: item.count },
          to: can('schedule.view') ? `${base}/schedule?date=${item.date}` : null,
        });
        break;
      case 'sync_failed':
        out.push({
          id: 'sync_failed',
          icon: 'sync',
          tone: 'warn',
          titleKey: item.provider ? 'attention.syncFailedProvider' : 'attention.syncFailed',
          values: { provider: item.provider ?? '' },
          to: can('schedule.view') ? `${base}/schedule` : null,
        });
        break;
      case 'unmapped_courts':
        out.push({
          id: 'unmapped_courts',
          icon: 'courts',
          tone: 'warn',
          titleKey: 'attention.unmappedCourts',
          values: { count: item.count },
          to: can('courts.edit') ? `${base}/club/courts` : null,
        });
        break;
      case 'game_without_court':
        out.push({
          id: `game_without_court:${item.date}`,
          icon: 'court',
          tone: 'warn',
          titleKey: 'attention.gameWithoutCourt',
          values: { count: item.count },
          to: can('schedule.view') ? `${base}/schedule?date=${item.date}` : null,
        });
        break;
      case 'unpaid_past':
        if (!can('billing.collect') && !can('reports.revenue')) break;
        out.push({
          id: 'unpaid_past',
          icon: 'money',
          tone: 'warn',
          titleKey: 'attention.unpaidPast',
          values: { count: item.count },
          amount: { cents: item.amountCents, currency: item.currency },
          to: can('bookings.view') ? `${base}/bookings?scope=past&payment=UNPAID` : null,
        });
        break;
      case 'new_reviews':
        if (!can('reviews.view')) break;
        out.push({
          id: 'new_reviews',
          icon: 'reviews',
          tone: 'info',
          titleKey: 'attention.newReviews',
          values: { count: item.count },
          to: null,
        });
        break;
      case 'setup':
        break;
    }
  }
  return out;
}

/** Setup checklist steps: which screen fixes each gap and who may open it. */
export const SETUP_STEPS: Array<{ key: keyof ClubSetupChecklist; page: ClubPageId; capability: ClubAdminCapability }> = [
  { key: 'hasCourts', page: 'courts', capability: 'courts.edit' },
  { key: 'hasHours', page: 'hours', capability: 'club.edit' },
  { key: 'hasPrices', page: 'pricing', capability: 'billing.configure' },
  { key: 'hasPhotos', page: 'profile', capability: 'club.edit' },
  { key: 'hasContacts', page: 'profile', capability: 'club.edit' },
];
