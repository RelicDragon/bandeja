import type { PremiumNameStyle, User } from '@/types';

/** Public decoration only; never use this to determine membership benefits or app theme. */
export function showsPremiumStatus(user: Pick<User, 'isPremium' | 'showPremiumStatus'> | null | undefined): boolean {
  return user?.isPremium === true && user.showPremiumStatus !== false;
}

/** Display order in the picker. `gold` is the default and the original look. */
export const PREMIUM_NAME_STYLES: readonly PremiumNameStyle[] = [
  'gold',
  'platinum',
  'rose',
  'ember',
  'aurora',
  'neon',
  'holo',
  'frost',
];

/** Unknown or missing values (older payloads, newer enum members) render gold. */
export function resolvePremiumNameStyle(value: unknown): PremiumNameStyle {
  return (PREMIUM_NAME_STYLES as readonly unknown[]).includes(value) ? (value as PremiumNameStyle) : 'gold';
}

export type PremiumNameTone = 'auto' | 'light' | 'dark';

/**
 * Class list for a premium name in `style`. `tone` pins the palette when the
 * name sits on a surface that does not follow the app appearance (a coloured
 * hero card, a split preview swatch). Callers gate on `showsPremiumStatus`.
 */
export function premiumNameClassName(
  style: unknown,
  options: { animated?: boolean; tone?: PremiumNameTone } = {},
): string {
  const resolved = resolvePremiumNameStyle(style);
  let className = `premium-name premium-name--${resolved}`;
  if (options.tone === 'light') className += ' premium-name--on-light';
  if (options.tone === 'dark') className += ' premium-name--on-dark';
  if (options.animated) className += ' premium-name--animated';
  return className;
}
