import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import { showsPremiumStatus } from '@/utils/premiumIdentity';
import '@/styles/premium-name.css';

type PremiumNameProps = ComponentProps<'span'> & {
  user: Pick<BasicUser, 'isPremium' | 'showPremiumStatus'> | null | undefined;
};

export function PremiumName({ user, className = '', children, ...props }: PremiumNameProps) {
  const { t } = useTranslation();
  const visible = showsPremiumStatus(user);
  return (
    <span
      {...props}
      className={`${visible ? 'premium-name-glow ' : ''}${className}`}
      title={visible ? t('profile.mainThemePremium') : props.title}
    >
      {children}
    </span>
  );
}
