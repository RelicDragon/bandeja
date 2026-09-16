import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { usePremiumWelcomeStore } from '@/store/premiumWelcomeStore';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import artwork from '@/assets/premium/bandeja-premium-inner-circle.png';
import stoneTexture from '@/assets/premium/obsidian-gold-stone.webp';
import '@/styles/premium-welcome.css';

// Stagger the gold field into view after the doors open; replay stays deterministic.
const motes = Array.from({ length: 24 }, (_, index) => ({
  '--mote-x': `${4 + (index * 37) % 92}%`,
  '--mote-y': `${40 + (index * 29) % 64}%`,
  '--mote-drift': `${(index % 2 ? 1 : -1) * (18 + index % 5 * 11)}px`,
  '--mote-rise': `${22 + index % 6 * 2}dvh`,
  '--mote-size': `${[1.5, 2, 2.5, 3][index % 4]}px`,
  '--mote-duration': `${6 + index % 5}s`,
  '--mote-delay': `${4.2 + (index * 17) % 32 * 0.07}s`,
} as CSSProperties));

export function PremiumWelcome({ online }: { online: boolean }) {
  const user = useAuthStore((s) => s.user);
  const initializing = useAuthStore((s) => s.isInitializing);
  const authenticated = useAuthStore((s) => s.isAuthenticated);
  const requestedUserId = usePremiumWelcomeStore((s) => s.userId);
  const userId = user?.id;
  const premium = user?.isPremium === true;
  const dismissedUserIds = useRef(new Set<string>());

  useEffect(() => {
    if (!userId || !premium || initializing || !authenticated || !online) return;
    let cancelled = false;
    const completionAtRequest = useAuthStore.getState().user?.premiumOnboardingCompletedAt;
    void usersApi.getPremiumOnboarding().then(({ data }) => {
      const auth = useAuthStore.getState();
      if (cancelled || auth.user?.id !== userId || !auth.isAuthenticated) return;
      // A header replay can be dismissed while this startup request is in flight.
      const completedAt = auth.user.premiumOnboardingCompletedAt !== completionAtRequest
        ? auth.user.premiumOnboardingCompletedAt
        : data.premiumOnboardingCompletedAt;
      auth.updateUser({ ...auth.user, ...data, premiumOnboardingCompletedAt: completedAt });
      if (data.isPremium && !completedAt && !dismissedUserIds.current.has(userId)) {
        usePremiumWelcomeStore.getState().open(userId);
      }
    }).catch(() => {
      // Retry on reconnect or the next launch; cached membership is not authoritative.
    });
    return () => { cancelled = true; };
  }, [userId, premium, initializing, authenticated, online]);

  useEffect(() => {
    if (!authenticated || !premium || (requestedUserId && requestedUserId !== userId)) {
      usePremiumWelcomeStore.getState().close();
    }
  }, [authenticated, premium, requestedUserId, userId]);

  if (!userId || initializing || !authenticated || !premium || requestedUserId !== userId) return null;
  return <PremiumWelcomeDialog key={userId} userId={userId} onDismiss={() => dismissedUserIds.current.add(userId)} />;
}

function PremiumWelcomeDialog({ userId, onDismiss }: { userId: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const [imageFailed, setImageFailed] = useState(false);
  const dismissed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const close = async () => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismiss();
    setOpen(false);
    timer.current = setTimeout(() => usePremiumWelcomeStore.getState().close(), 400);
    const auth = useAuthStore.getState();
    if (auth.user?.id !== userId) return;
    if (!auth.user.premiumOnboardingCompletedAt) {
      auth.updateUser({ ...auth.user, mainTheme: 'premium' });
      try {
        const { data } = await usersApi.completePremiumOnboarding();
        const current = useAuthStore.getState();
        if (current.user?.id !== userId || !current.isAuthenticated) return;
        current.updateUser({ ...current.user, ...data });
      } catch {
        // Saving is best-effort: never block dismissal or reopen this session.
      }
    }
  };

  return (
    <FullScreenDialog
      open={open}
      onClose={() => { void close(); }}
      modalId="premium-welcome"
      title="Bandeja Premium · Welcome to the inner circle"
      closeOnInteractOutside={false}
      overlayClassName="premium-welcome-backdrop"
      contentClassName="premium-welcome"
      bodyClassName="premium-welcome-body"
    >
      <div className={`premium-welcome-stage${ready ? ' is-ready' : ''}${imageFailed ? ' has-failed' : ''}`}>
        <div className="premium-welcome-frame">
          <div className="premium-welcome-scene">
            <img
              src={artwork}
              alt="You have been chosen. Welcome to the inner circle. Bandeja Premium. Your admission has been approved."
              className="premium-welcome-art"
              onLoad={() => setReady(true)}
              onError={() => setImageFailed(true)}
            />
            {imageFailed && <div className="premium-welcome-fallback">Bandeja Premium<br />Welcome to the inner circle</div>}
            {ready && <div className="premium-welcome-atmosphere" aria-hidden="true">
              <div className="premium-welcome-light premium-welcome-light-left" />
              <div className="premium-welcome-light premium-welcome-light-right" />
              <div className="premium-welcome-gilding" />
              <div className="premium-welcome-particles">
                {motes.map((style, index) => <i className="premium-welcome-mote" key={index} style={style} />)}
              </div>
            </div>}
          </div>
        </div>
        {!imageFailed && <div className="premium-welcome-entrance" aria-hidden="true">
          <div className="premium-welcome-door premium-welcome-door-left" />
          <div
            className="premium-welcome-door premium-welcome-door-right"
            onAnimationEnd={(event) => {
              if (event.animationName === 'premium-welcome-open-right') setDoorsOpen(true);
            }}
          />
          <div className="premium-welcome-threshold" />
          <div className="premium-welcome-seal">
            <div className="premium-welcome-seal-core">
              <img src="/premium/bandeja-gold-crest.webp" alt="" />
            </div>
          </div>
        </div>}
      </div>
      <div className="premium-welcome-actions">
        {(imageFailed || (ready && (doorsOpen || reducedMotion))) && <div className="premium-welcome-action-reveal">
        <button
          type="button"
          className="premium-welcome-accept"
          style={{ '--welcome-stone': `url("${stoneTexture}")` } as CSSProperties}
          onClick={() => { void close(); }}
        >
          <span className="premium-welcome-accept-core">
            <span className="premium-welcome-accept-label">{t('common.premiumWelcomeAccept')}</span>
          </span>
        </button>
        </div>}
      </div>
    </FullScreenDialog>
  );
}
