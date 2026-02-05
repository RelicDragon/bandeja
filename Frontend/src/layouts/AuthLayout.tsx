import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector, ThemeSelector } from '@/components';

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { t } = useTranslation();
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
      <div 
        className="min-h-screen relative flex items-center justify-center px-4 overflow-y-auto"
        style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
      >
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
      
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary-300/15 dark:bg-primary-500/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] bg-cyan-400/10 dark:bg-cyan-500/6 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-0 w-80 h-80 bg-sky-400/5 dark:bg-sky-500/5 rounded-full blur-3xl" />
      </div>

      {/* Subtle grid */}
      <div 
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M0 0h1v40H0V0zm0 0v1h40V0H0z'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Settings buttons */}
      <div 
        className="fixed z-20 flex items-center gap-2" 
        style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <LanguageSelector />
        <ThemeSelector />
      </div>

      {/* Main content */}
      <div className="w-full max-w-md min-w-0 relative z-10">
        {/* Card */}
        <div className="auth-panel bg-white/90 dark:bg-slate-800/90 backdrop-blur-3xl rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-black/40 border border-slate-200/80 dark:border-slate-700/60 p-8 sm:p-10 transition-all duration-300 min-w-0 overflow-visible">
          <div className="flex justify-center mb-6 -mt-2">
            <img
              src="/bandeja2-white-tr.png"
              alt=""
              className="auth-panel-logo h-24 w-auto object-contain"
            />
          </div>
          {children}
        </div>

        {/* Logo/Brand */}
        <div className="text-center mt-6">
          <div
            className={`auth-logo-top dark:hidden cursor-pointer select-none transition-transform duration-300 ${isAnimating ? 'logo-bounce' : 'hover:scale-105'}`}
            onClick={handleLogoClick}
            role="img"
            aria-label={t('app.title')}
          />
          <img
            src="/bandeja-logo.png"
            alt={t('app.title')}
            className={`auth-logo-top-img hidden dark:block h-8 w-auto mx-auto cursor-pointer select-none object-contain transition-transform duration-300 ${isAnimating ? 'logo-bounce' : 'hover:scale-105'}`}
            onClick={handleLogoClick}
          />
        </div>

        {/* Footer 
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-5">
          © 2026 Bandeja DOO
        </p>
        */}
      </div>
    </div>
    </>
  );
};
