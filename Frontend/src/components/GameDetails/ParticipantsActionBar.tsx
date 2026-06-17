import { Sliders, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

type ParticipantsActionBarProps = {
  showInviteButton: boolean;
  showManageButton: boolean;
  onInvite: () => void;
  onManage: () => void;
};

export const ParticipantsActionBar = ({
  showInviteButton,
  showManageButton,
  onInvite,
  onManage,
}: ParticipantsActionBarProps) => {
  const { t } = useTranslation();
  const buttonCount = (showInviteButton ? 1 : 0) + (showManageButton ? 1 : 0);
  if (buttonCount === 0) return null;

  const labelClass = buttonCount === 2 ? 'hidden sm:inline' : 'inline';

  return (
    <div className="flex gap-2">
      {showInviteButton && (
        <motion.button
          type="button"
          onClick={onInvite}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50/80 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300 dark:hover:border-primary-700 dark:hover:bg-primary-950/60"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/60 dark:text-primary-400">
            <UserPlus size={16} />
          </span>
          <span className={labelClass}>{t('games.invite')}</span>
        </motion.button>
      )}
      {showManageButton && (
        <motion.button
          type="button"
          onClick={onManage}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            <Sliders size={16} />
          </span>
          <span className={labelClass}>{t('games.players')}</span>
        </motion.button>
      )}
    </div>
  );
};
