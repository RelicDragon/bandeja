import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import type { ReferralInvite } from '@/api/referral';
import { Card } from '@/components/Card';
import { EmptyStateCard } from '@/components/home/EmptyStateCard';
import { ReferrerAvatar } from '@/components/referral/ReferrerAvatar';
import {
  referralChipSpec,
  referralInviteName,
} from '@/features/referral/referralInviteChip';

export interface ReferralInvitesListProps {
  invites: ReferralInvite[];
  className?: string;
}

/**
 * PRD 351 — "Your invites".
 *
 * A row is a person we know (`JOINED` / `PLAYED`) or a link that was opened and
 * never signed up (`INVITED`, shown as "Pending"). Every chip carries text, so
 * the state survives a colour-blind reader and a monochrome screenshot alike.
 */
export const ReferralInvitesList = ({ invites, className = '' }: ReferralInvitesListProps) => {
  const { t } = useTranslation();

  if (invites.length === 0) {
    return (
      <div className={className}>
        <EmptyStateCard
          icon={UserPlus}
          title={t('referral.emptyTitle')}
          description={t('referral.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
        {t('referral.yourInvites')}
      </h4>
      <ul className="space-y-2">
        {invites.map((invite) => {
          const chip = referralChipSpec(invite.state, invite.rewardCoins);
          const name = referralInviteName(invite.user);
          return (
            <li key={invite.id} className="flex items-center gap-3">
              <ReferrerAvatar
                firstName={invite.user?.firstName ?? null}
                avatar={invite.user?.avatar ?? null}
                size={32}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                {name ?? t('referral.pending')}
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${chip.className}`}
              >
                {chip.coins === null
                  ? t(chip.labelKey)
                  : `${t(chip.labelKey)} · +${chip.coins}`}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
