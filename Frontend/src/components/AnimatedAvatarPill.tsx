import { useTranslation } from 'react-i18next';

/** Quiet marker over the animated-avatar editors: "Animated · plays on your profile". */
export function AnimatedAvatarPill() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium tracking-wide text-white/90 ring-1 ring-white/15">
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-amber-300 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-amber-300" />
      </span>
      {t('profile.animatedAvatarPill')}
    </span>
  );
}
