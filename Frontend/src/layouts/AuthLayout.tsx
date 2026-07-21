import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LanguageSelector, ThemeSelector, MainTabFooter } from '@/components';
import { AuthWaveBackground } from './AuthWaveBackground';
import './AuthLayout.css';

interface AuthLayoutProps {
  children: ReactNode;
}

const ease = [0.22, 1, 0.36, 1] as const;

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="auth-shell">
      <AuthWaveBackground />

      <motion.div
        className="auth-shell__chrome"
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease }}
      >
        <LanguageSelector />
        <ThemeSelector />
      </motion.div>

      <div className="auth-shell__stage">
        <motion.div
          className="auth-shell__card"
          initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease }}
        >
          <div className="auth-panel">
            <div className="auth-panel__content">{children}</div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="auth-shell__mascot"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.25, ease }}
      >
        <div className="auth-footer-logo">
          <MainTabFooter compact />
        </div>
      </motion.div>
    </div>
  );
};
