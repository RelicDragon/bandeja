import { useState } from 'react';

export const ProfileHeaderContent = () => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleLogoClick = () => {
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 1200);
  };

  return (
    <>
      <style>{`
        @keyframes logoBounce {
          0% { transform: rotate(0deg) scale(1); }
          10% { transform: rotate(15deg) scale(1.15); }
          20% { transform: rotate(0deg) scale(1); }
          30% { transform: rotate(10deg) scale(1.1); }
          40% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(6deg) scale(1.06); }
          60% { transform: rotate(0deg) scale(1); }
          70% { transform: rotate(3deg) scale(1.03); }
          80% { transform: rotate(0deg) scale(1); }
          90% { transform: rotate(1deg) scale(1.01); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .logo-bounce {
          animation: logoBounce 1.2s ease-out;
        }
      `}</style>
      <div className="flex items-center">
        <img 
          src="/bandeja-blue-flat-small.png" 
          alt="Bandeja Logo" 
          className={`h-12 cursor-pointer select-none ${isAnimating ? 'logo-bounce' : ''}`}
          onClick={handleLogoClick}
        />
      </div>
    </>
  );
};
