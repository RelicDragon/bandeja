import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import { showsPremiumStatus } from '@/utils/premiumIdentity';
import { useNameColorClass } from '@/features/collection/useEquippedGoods';
import '@/styles/premium-name.css';
import '@/styles/collection.css';

type PremiumNameProps = ComponentProps<'span'> & {
  user: Pick<BasicUser, 'isPremium' | 'showPremiumStatus'> & { id?: string } | null | undefined;
};

/**
 * Renders a player's name with whatever identity decoration they are entitled
 * to.
 *
 * PRD 355 — an equipped name colour paints the name everywhere it renders, but
 * **premium gold always wins**: membership is what the glow signals, and a
 * bought colour must not be able to imitate or override it.
 */
export function PremiumName({ user, className = '', children, ...props }: PremiumNameProps) {
  const { t } = useTranslation();
  const visible = showsPremiumStatus(user);
  const nameColor = useNameColorClass(user?.id, visible);
  const decoration = visible ? 'premium-name-glow ' : nameColor ? `${nameColor} ` : '';
  return (
    <span
      {...props}
      className={`${decoration}${className}`}
      title={visible ? t('profile.mainThemePremium') : props.title}
    >
      {children}
    </span>
  );
}
