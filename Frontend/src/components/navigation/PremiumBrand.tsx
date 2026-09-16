import { useAuthStore } from '@/store/authStore';
import { usePremiumWelcomeStore } from '@/store/premiumWelcomeStore';

export function PremiumBrand() {
  const user = useAuthStore((s) => s.user);

  return (
    <button type="button" className="premium-brand" aria-label="Bandeja Premium" onClick={() => {
      if (user?.isPremium) usePremiumWelcomeStore.getState().open(user.id);
    }}>
      <img src="/premium/bandeja-gold-crest.webp" alt="" width={88} height={56} />
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
