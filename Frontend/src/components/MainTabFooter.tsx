import { useState, useCallback } from 'react';
import { useBrandingFooterIconUrl } from '@/hooks/useBrandingFooterIconUrl';

interface MainTabFooterProps {
  isLoading?: boolean;
  compact?: boolean;
}

export const MainTabFooter = ({ isLoading = false, compact = false }: MainTabFooterProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const footerIconUrl = useBrandingFooterIconUrl();

  const handleClick = useCallback(() => {
    if (isAnimating || isLoading) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 1800);
  }, [isAnimating, isLoading]);

  const animationClass = isLoading ? 'animate-splash-logo' : isAnimating ? 'animate-splash-logo-once' : '';

  return (
    <div className={`flex justify-center ${compact ? 'py-2' : 'py-6'}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="auth-mascot-btn cursor-pointer select-none rounded-lg p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-default"
        aria-label="Logo"
      >
        <img
          src={footerIconUrl}
          alt="Bandeja Logo"
          className={`object-contain ${compact ? 'h-14 w-28' : 'h-16 w-32'} ${animationClass}`}
        />
      </button>
    </div>
  );
};
