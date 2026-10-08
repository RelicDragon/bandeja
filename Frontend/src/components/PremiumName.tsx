import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import { premiumNameClassName, showsPremiumStatus, type PremiumNameTone } from '@/utils/premiumIdentity';
import { useNameColorClass } from '@/features/collection/useEquippedGoods';
import '@/styles/premium-name.css';
import '@/styles/collection.css';

type PremiumNameProps = ComponentProps<'span'> & {
  user:
    | (Pick<BasicUser, 'isPremium' | 'showPremiumStatus'> & Partial<Pick<BasicUser, 'premiumNameStyle'>> & { id?: string })
    | null
    | undefined;
  /** Hero surfaces only (profile header, own preview): a slow sheen. Lists stay static. */
  animated?: boolean;
  /** Pin the palette when the name sits on a surface that ignores the app appearance. */
  tone?: PremiumNameTone;
};

/**
 * Renders a player's name with whatever identity decoration they are entitled
 * to. Spec: docs/domains/premium-appearance.md § Name styles.
 *
 * PRD 355 — an equipped name colour paints the name everywhere it renders, but
 * **the premium name style always wins**: membership is what the style signals,
 * and a bought colour must not be able to imitate or override it.
 */
export function PremiumName({ user, animated = false, tone = 'auto', className = '', children, ...props }: PremiumNameProps) {
  const { t } = useTranslation();
  const visible = showsPremiumStatus(user);
  const nameColor = useNameColorClass(user?.id, visible);
  const decoration = visible
    ? `${premiumNameClassName(user?.premiumNameStyle, { animated, tone })} `
    : nameColor
      ? `${nameColor} `
      : '';
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
