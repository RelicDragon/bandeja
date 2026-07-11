import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
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

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const handleSectionClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-settings-row]')) return;
      if (target.closest('[data-settings-interactive]')) return;
      toggleCollapsed();
    },
    [toggleCollapsed],
  );

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
              data-settings-interactive
              className={
                title
                  ? 'absolute right-0 top-1/2 -translate-y-1/2 shrink-0'
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

      <div
        aria-hidden
        className={`group relative z-10 flex w-full items-center justify-center border-t border-gray-100 py-1 text-gray-400 transition-colors duration-200 group-hover/section:text-gray-600 dark:border-gray-800 dark:group-hover/section:text-gray-300 ${
          variant === 'card'
            ? '-mx-2 -mb-2 mt-2 rounded-b-xl'
            : variant === 'section'
              ? '-mx-2 -mb-2 mt-2 w-[calc(100%+1rem)] rounded-b-xl'
              : '-mx-2 -mb-2 mt-2 w-[calc(100%+1rem)] rounded-b-lg'
        }`}
      >
        <motion.span
          animate={{ rotate: isCollapsed ? 0 : 180 }}
          transition={expandTransition}
          className="transition-transform duration-200"
        >
          <ChevronDown size={18} />
        </motion.span>
      </div>
    </>
  );

  const shellClassName = `group/section cursor-pointer transition-all duration-300 ease-in-out hover:bg-gray-50/50 dark:hover:bg-gray-800/30 ${
    isCollapsed ? 'relative z-[5]' : ''
  }`;

  if (variant === 'card') {
    return (
      <Card
        className={shellClassName}
        onClick={handleSectionClick}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? t('common.expand') : t('common.collapse')}
      >
        {inner}
      </Card>
    );
  }

  if (variant === 'section') {
    return (
      <div
        className={`rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${shellClassName}`}
        onClick={handleSectionClick}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? t('common.expand') : t('common.collapse')}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className={shellClassName}
      onClick={handleSectionClick}
      aria-expanded={!isCollapsed}
      title={isCollapsed ? t('common.expand') : t('common.collapse')}
    >
      {inner}
    </div>
  );
}
