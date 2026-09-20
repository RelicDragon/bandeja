import { ReferralCaptureBanner } from '@/components/referral/ReferralCaptureBanner';

export interface ReferralWelcomeBannerProps {
  className?: string;
}

/**
 * PRD 350's onboarding Welcome step mounts this unconditionally; PRD 351 fills
 * it in.
 *
 * It is a thin alias for {@link ReferralCaptureBanner} — the Welcome step and
 * the Register screen show the same four states ("invited by X", "have a
 * code?", the code field, and the after-7-days caption), and keeping one
 * implementation means the copy and the window rule can only ever drift
 * together. `ReferralCaptureBanner` renders `null` when there is nothing to
 * say, so mounting this costs nothing for a user who arrived without a
 * referral.
 */
export const ReferralWelcomeBanner = ({ className }: ReferralWelcomeBannerProps) => (
  <ReferralCaptureBanner className={className} />
);
