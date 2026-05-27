import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isAndroid } from '@/utils/capacitor';
import { getAppScrollTop, scrollAppToTop, subscribeAppScroll } from '@/utils/appScroll';

const SCROLL_TOP_THRESHOLD_PX = 80;

export function LeaderboardScrollToTopFab() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(getAppScrollTop() > SCROLL_TOP_THRESHOLD_PX);
    };
    const unsubscribe = subscribeAppScroll(onScroll);
    onScroll();
    return unsubscribe;
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  const scrollToTop = () => {
    scrollAppToTop(isAndroid() ? 'auto' : 'smooth');
  };

  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.button
          key="leaderboard-scroll-top"
          type="button"
          onClick={scrollToTop}
          initial={{ opacity: 0, scale: 0.8, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 12 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className="fixed z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-gray-800 shadow-[0_2px_8px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.18)] ring-1 ring-gray-200/90 backdrop-blur-sm hover:bg-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.14),0_12px_32px_rgba(0,0,0,0.22)] dark:bg-gray-900/95 dark:text-gray-100 dark:shadow-[0_2px_10px_rgba(0,0,0,0.45),0_10px_28px_rgba(0,0,0,0.55)] dark:ring-gray-700 dark:hover:bg-gray-900 dark:hover:shadow-[0_4px_14px_rgba(0,0,0,0.5),0_14px_36px_rgba(0,0,0,0.6)]"
          style={{
            right: 'max(1rem, env(safe-area-inset-right))',
            bottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
          }}
          aria-label={t('common.scrollToTop', { defaultValue: 'Scroll to top' })}
        >
          <ChevronUp className="h-5 w-5" aria-hidden />
        </motion.button>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
