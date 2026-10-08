import { useEffect } from 'react';
import { useBrandingFooterIconUrl } from '@/hooks/useBrandingFooterIconUrl';
import { BOOT_SPLASH_BG, notifyShellPainted } from '@/utils/bootSplash';
import { useAuthStore } from '@/store/authStore';
import { activeMemberTheme } from '@/utils/mainTheme';
import { MemberLoading } from '@/components/MemberLoading';

interface AppLoadingScreenProps {
  isInitializing: boolean;
}

export const AppLoadingScreen = ({ isInitializing }: AppLoadingScreenProps) => {
  const iconUrl = useBrandingFooterIconUrl();
  const memberTheme = useAuthStore((s) => activeMemberTheme(s.user));

  useEffect(() => {
    if (!isInitializing) return;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        notifyShellPainted();
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [isInitializing]);

  if (!isInitializing) return null;

  if (memberTheme) {
    return <MemberLoading theme={memberTheme} variant="screen" className="fixed inset-0 z-50" />;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ backgroundColor: BOOT_SPLASH_BG }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={iconUrl}
          alt="Logo"
          width={220}
          height={220}
          className="w-[220px] h-[220px] object-contain animate-splash-logo"
        />
      </div>
    </div>
  );
};
