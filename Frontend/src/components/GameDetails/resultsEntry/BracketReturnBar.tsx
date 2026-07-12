import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import {
  buildGameBracketReturnPath,
  type GameBracketReturnTarget,
} from '@/utils/gameBracketReturn.util';

export const BracketReturnBar = ({ target }: { target: GameBracketReturnTarget }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="mb-4 flex justify-center">
      <motion.button
        type="button"
        onClick={() => navigate(buildGameBracketReturnPath(target))}
        whileTap={{ scale: 0.97 }}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100 hover:shadow-md dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/60"
      >
        <Trophy className="h-4 w-4 shrink-0" aria-hidden />
        {t('gameDetails.returnToBracket')}
      </motion.button>
    </div>
  );
};
