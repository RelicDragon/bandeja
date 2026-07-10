import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type CollapsibleSettingsShellVariant = 'card' | 'section' | 'plain';

interface CollapsibleSettingsShellProps {
  title?: string;
  icon?: LucideIcon;
  hintsButton?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
  variant?: CollapsibleSettingsShellVariant;
}

export function CollapsibleSettingsShell({
  title,
  icon: Icon,
  hintsButton,
  children,
  defaultCollapsed = true,
  variant = 'section',
}: CollapsibleSettingsShellProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const expandTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.21, 0.47, 0.32, 0.98] as const };

  const hintsTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: 'easeInOut' as const };

  const showHeader = Boolean(title) || Boolean(Icon) || (!isCollapsed && Boolean(hintsButton));

  const inner = (
    <>
      {showHeader ? (
        <div
          className={`relative flex items-center gap-2 ${isCollapsed ? '' : 'mb-3'} ${
            title && hintsButton ? 'pr-11' : ''
          }`}
        >
          {(Icon || title) ? (
            <div className="flex min-w-0 items-center gap-2">
              {Icon ? <Icon size={18} className="shrink-0 text-gray-500 dark:text-gray-400" /> : null}
              {title ? <h2 className="section-title">{title}</h2> : null}
            </div>
          ) : null}
          {hintsButton ? (
            <div
              className={
                title
                  ? 'pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 shrink-0'
                  : 'ml-auto shrink-0'
              }
            >
              <AnimatePresence initial={false}>
                {!isCollapsed ? (
                  <motion.div
                    key="settings-hints-button"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={hintsTransition}
                    className={title ? 'pointer-events-auto' : undefined}
                  >
                    {hintsButton}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {!isCollapsed ? (
          <motion.div
            key="settings-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expandTransition}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        className={`group relative z-10 flex w-full items-center justify-center border-t border-gray-100 py-1 text-gray-400 transition-colors duration-200 hover:bg-gray-50/80 hover:text-gray-600 dark:border-gray-800 dark:hover:bg-gray-800/50 dark:hover:text-gray-300 ${
          variant === 'card'
            ? '-mx-2 -mb-2 mt-2 rounded-b-xl'
            : variant === 'section'
              ? '-mx-2 -mb-2 mt-2 w-[calc(100%+1rem)] rounded-b-xl'
              : '-mx-2 -mb-2 mt-2 w-[calc(100%+1rem)] rounded-b-lg'
        }`}
        title={isCollapsed ? t('common.expand') : t('common.collapse')}
      >
        <motion.span
          animate={{ rotate: isCollapsed ? 0 : 180 }}
          transition={expandTransition}
          className="transition-transform duration-200 group-active:scale-90"
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>
    </>
  );

  if (variant === 'card') {
    return (
      <Card className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'relative z-[5]' : ''}`}>
        {inner}
      </Card>
    );
  }

  if (variant === 'section') {
    return (
      <div
        className={`rounded-xl border border-gray-200 bg-white p-4 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 ${
          isCollapsed ? 'relative z-[5]' : ''
        }`}
      >
        {inner}
      </div>
    );
  }

  return <div>{inner}</div>;
}
