import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { Game } from '@/types';
import { ConfirmationModal } from '@/components';
import { ResultsArtifactsTelegramBlock } from '../ResultsArtifactsTelegramBlock';
import { TelegramSummaryModal } from '../TelegramSummaryModal';
import type { ResultsArtifactsTelegramController } from './useResultsArtifactsTelegram';

interface ResultsTelegramSectionProps {
  currentGame: Game | null;
  telegram: ResultsArtifactsTelegramController;
}

export const ResultsTelegramSection = ({ currentGame, telegram }: ResultsTelegramSectionProps) => {
  const { t } = useTranslation();

  return (
    <>
      {telegram.showSendToTelegramButton && (
        <ResultsArtifactsTelegramBlock
          artifacts={currentGame?.resultsArtifacts}
          hasSummaryText={telegram.hasCachedSummary}
          hasGamePhoto={telegram.hasPhotosForTelegramPost}
          isSending={telegram.isSendingToTelegram}
          isStartingGeneration={telegram.isStartingArtifactGeneration}
          photoGenerationsMaxFallback={telegram.photoGenerationsMaxFallback}
          canManagePhotos={telegram.canManagePhotos}
          onSend={telegram.handleSendToTelegram}
          onGeneratePhoto={telegram.handleGenerateResultsPhoto}
        />
      )}

      {telegram.showSentToTelegramHint && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col items-center gap-3"
        >
          <p className="inline-flex items-center gap-1.5 text-center text-sm text-gray-500 dark:text-gray-400">
            <Send size={14} className="shrink-0 text-sky-500" aria-hidden />
            {t('gameResults.resultsAlreadySentToTelegram') || 'Results already sent to Telegram'}
          </p>
          <motion.button
            type="button"
            onClick={() => telegram.setShowResendConfirm(true)}
            disabled={telegram.isResettingTelegram}
            whileTap={telegram.isResettingTelegram ? undefined : { scale: 0.97 }}
            className="min-w-[200px] rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-red-500/25 transition-all hover:from-red-600 hover:to-rose-700 hover:shadow-lg hover:shadow-red-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:text-base"
          >
            {telegram.isResettingTelegram
              ? t('common.loading')
              : t('gameResults.resendResultsToTelegram') || 'Resend to Telegram'}
          </motion.button>
        </motion.div>
      )}

      <ConfirmationModal
        isOpen={telegram.showResendConfirm}
        title={t('gameResults.resendResultsToTelegram') || 'Resend to Telegram'}
        message={
          t('gameResults.resendResultsToTelegramConfirm') ||
          'Reset the sent state and open the summary to send again to the Telegram chat?'
        }
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={telegram.isResettingTelegram}
        loadingText={t('common.loading')}
        onConfirm={telegram.handleResendConfirm}
        onClose={() => telegram.setShowResendConfirm(false)}
      />

      <ConfirmationModal
        isOpen={telegram.showNoPhotosConfirm}
        title={t('gameResults.sendWithoutPhotosTitle')}
        message={t('gameResults.sendWithoutPhotosMessage')}
        confirmText={t('gameResults.sendWithoutPhotosConfirm')}
        cancelText={t('common.cancel')}
        tone="info"
        confirmVariant="primary"
        onConfirm={telegram.handleConfirmNoPhotos}
        onClose={() => telegram.setShowNoPhotosConfirm(false)}
      />

      <TelegramSummaryModal
        isOpen={telegram.isTelegramSummaryModalOpen}
        onClose={() => telegram.setIsTelegramSummaryModalOpen(false)}
        gameId={currentGame?.id || ''}
        initialSummary={telegram.telegramSummary}
        onSend={telegram.handleSendSummaryToTelegram}
      />
    </>
  );
};
