import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import type { Club } from '@/types';
import { ClubAvatar } from '@/components/ClubAvatar';
import { BooktimeConnectForm } from './BooktimeConnectForm';
import { PadelooConnectForm } from './PadelooConnectForm';
import { KlikterenConnectForm } from './KlikterenConnectForm';
import type { BooktimeIntegrationConfig } from './ConnectClubSheet';
import { isKlikterenClub, isPadelooClub } from '@shared/clubIntegration';

type ClubBookingConnectInlineProps = {
  club: Club;
  integrationConfig?: BooktimeIntegrationConfig;
  onConnected: () => void;
  onSkip: () => void;
  collapsed?: boolean;
  onCollapsedClick?: () => void;
};

export function ClubBookingConnectInline({
  club,
  integrationConfig,
  onConnected,
  onSkip,
  collapsed = false,
  onCollapsedClick,
}: ClubBookingConnectInlineProps) {
  const { t } = useTranslation();
  const isKlikteren = isKlikterenClub(club);
  const isPadeloo = isPadelooClub(club);
  const authTitle = isKlikteren
    ? t('createGame.klikteren.authTitle', { defaultValue: 'Connect your Klikteren account' })
    : isPadeloo
    ? t('createGame.padeloo.authTitle', { defaultValue: 'Connect your Padeloo account' })
    : t('createGame.booktime.authTitle');
  const authHint = isKlikteren
    ? t('createGame.klikteren.authHint', {
        club: club.name,
        defaultValue: `Sign in with email and password to book at ${club.name}.`,
      })
    : isPadeloo
    ? t('createGame.padeloo.authHint', {
        club: club.name,
        defaultValue: `Sign in with email to book at ${club.name}.`,
      })
    : t('createGame.booktime.authHint', { club: club.name });
  const authorizeLabel = isKlikteren
    ? t('createGame.klikteren.authorizeInClub', {
        club: club.name,
        defaultValue: `Authorize in ${club.name}`,
      })
    : isPadeloo
    ? t('createGame.padeloo.authorizeInClub', {
        club: club.name,
        defaultValue: `Authorize in ${club.name}`,
      })
    : t('createGame.booktime.authorizeInClub', { club: club.name });

  return (
    <AnimatePresence mode="wait">
      {collapsed ? (
        <motion.button
          key="club-auth-collapsed"
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
          <span className="min-w-0 truncate">{authorizeLabel}</span>
        </motion.button>
      ) : (
        <motion.div
          key="club-auth-gate"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-primary-100 dark:border-primary-900/40 bg-primary-50/50 dark:bg-primary-950/20 p-4 space-y-3"
        >
          <div className="flex items-center gap-3">
            <ClubAvatar club={club} className="h-10 w-[3.75rem] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{authTitle}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{authHint}</p>
            </div>
          </div>

          {isKlikteren ? (
            <KlikterenConnectForm club={club} onConnected={onConnected} variant="inline" />
          ) : isPadeloo ? (
            <PadelooConnectForm club={club} onConnected={onConnected} variant="inline" />
          ) : integrationConfig ? (
            <BooktimeConnectForm
              club={club}
              integrationConfig={integrationConfig}
              onConnected={onConnected}
              variant="inline"
            />
          ) : null}

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
