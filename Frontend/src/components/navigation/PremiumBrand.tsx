import { useAuthStore } from '@/store/authStore';
import { usePremiumWelcomeStore } from '@/store/premiumWelcomeStore';
import { activeMemberTheme } from '@/utils/mainTheme';
import { MemberCrest } from './MemberCrest';

export function PremiumBrand() {
  const user = useAuthStore((s) => s.user);
  const theme = activeMemberTheme(user) ?? 'premium';

  return (
    <button type="button" className="premium-brand" aria-label="Bandeja Premium" onClick={() => {
      if (user?.isPremium) usePremiumWelcomeStore.getState().open(user.id);
    }}>
      <MemberCrest theme={theme} />
      <span className="premium-brand-type" dir="ltr">
        <span className="premium-brand-name">Bandeja</span>
        <span className="premium-brand-tier">
          <span className="premium-brand-dash" aria-hidden="true" />
          <span>Premium</span>
          <span className="premium-brand-dash" aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
