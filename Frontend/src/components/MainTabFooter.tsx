import { useState, useCallback } from 'react';

interface MainTabFooterProps {
  isLoading?: boolean;
}

export const MainTabFooter = ({ isLoading = false }: MainTabFooterProps) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = useCallback(() => {
    if (isAnimating || isLoading) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 1800);
  }, [isAnimating, isLoading]);

  const animationClass = isLoading ? 'animate-splash-logo' : isAnimating ? 'animate-splash-logo-once' : '';

  return (
    <div className="flex justify-center py-6">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg p-1 disabled:cursor-default"
        aria-label="Logo"
      >
        <img
          src="/bandeja2-white-tr.png"
          alt="Bandeja Logo"
          className={`h-16 w-32 object-contain ${animationClass}`}
        />
      </button>
    </div>
  );
};
