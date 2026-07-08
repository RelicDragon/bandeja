import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import type { Club } from '@/types';
import { ClubAvatar } from '@/components/ClubAvatar';
import { BooktimeConnectForm } from './BooktimeConnectForm';
import type { BooktimeIntegrationConfig } from './ConnectClubSheet';

type BooktimeConnectInlineProps = {
  club: Club;
  integrationConfig: BooktimeIntegrationConfig;
  onConnected: () => void;
  onSkip: () => void;
  collapsed?: boolean;
  onCollapsedClick?: () => void;
};

export function BooktimeConnectInline({
  club,
  integrationConfig,
  onConnected,
  onSkip,
  collapsed = false,
  onCollapsedClick,
}: BooktimeConnectInlineProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence mode="wait">
      {collapsed ? (
        <motion.button
          key="booktime-auth-collapsed"
          type="button"
          onClick={onCollapsedClick}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="w-full rounded-xl border border-primary-100 dark:border-primary-900/40 bg-primary-50/50 dark:bg-primary-950/20 px-4 py-3 text-left flex items-center gap-3 text-sm font-medium text-gray-900 dark:text-white"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-300">
            <KeyRound size={18} />
          </span>
          <span className="min-w-0 truncate">
            {t('createGame.booktime.authorizeInClub', { club: club.name })}
          </span>
        </motion.button>
      ) : (
        <motion.div
          key="booktime-auth-gate"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-primary-100 dark:border-primary-900/40 bg-primary-50/50 dark:bg-primary-950/20 p-4 space-y-3"
        >
          <div className="flex items-center gap-3">
            <ClubAvatar club={club} className="h-10 w-[3.75rem] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('createGame.booktime.authTitle')}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {t('createGame.booktime.authHint', { club: club.name })}
              </p>
            </div>
          </div>

          <BooktimeConnectForm
            club={club}
            integrationConfig={integrationConfig}
            onConnected={onConnected}
            variant="inline"
          />

          <button
            type="button"
            onClick={onSkip}
            className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline-offset-2 hover:underline"
          >
            {t('createGame.booktime.authOptOut')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
