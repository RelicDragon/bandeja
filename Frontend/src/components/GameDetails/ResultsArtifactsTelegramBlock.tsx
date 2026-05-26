import type { TFunction } from 'i18next';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameResultsArtifacts } from '@/types';
import {
  isPhotoReadyForTelegram,
  isSummaryReadyForTelegram,
  resolveTelegramResultsCta,
  type TelegramResultsCta,
} from '@/utils/gameResultsArtifacts.util';

type ResultsArtifactsTelegramBlockProps = {
  artifacts?: GameResultsArtifacts | null;
  hasSummaryText: boolean;
  hasGamePhoto: boolean;
  isSending: boolean;
  isPreparingArtifacts: boolean;
  onSend: () => void;
  onPrepare: () => void;
};

function stepLabel(ready: boolean, t: TFunction): string {
  return ready ? t('gameResults.artifactsStepDone') : t('gameResults.artifactsStepPending');
}

export function ResultsArtifactsTelegramBlock({
  artifacts,
  hasSummaryText,
  hasGamePhoto,
  isSending,
  isPreparingArtifacts,
  onSend,
  onPrepare,
}: ResultsArtifactsTelegramBlockProps) {
  const { t } = useTranslation();
  const cta = resolveTelegramResultsCta(artifacts, { hasSummaryText, hasGamePhoto });
  const summaryReady = isSummaryReadyForTelegram(artifacts, hasSummaryText);
  const photoReady = isPhotoReadyForTelegram(artifacts, hasGamePhoto);

  const isBusy = isSending || isPreparingArtifacts;

  return (
    <div className="mb-6 flex flex-col items-center gap-3 px-2">
      <ArtifactsStatusBanner
        cta={cta}
        artifacts={artifacts}
        summaryReady={summaryReady}
        photoReady={photoReady}
        t={t}
      />
      {cta === 'send' ? (
        <button
          type="button"
          onClick={onSend}
          disabled={isBusy}
          aria-busy={isSending}
          className={telegramPrimaryButtonClass(isBusy)}
        >
          <SendButtonContent isSending={isSending} t={t} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onPrepare}
          disabled={cta === 'preparing' || isBusy}
          aria-busy={isPreparingArtifacts || cta === 'preparing'}
          className={telegramPrimaryButtonClass(cta === 'preparing' || isBusy)}
        >
          <PrepareButtonContent cta={cta} isPreparing={isPreparingArtifacts} t={t} />
        </button>
      )}
    </div>
  );
}

function telegramPrimaryButtonClass(disabled: boolean): string {
  return `group flex min-h-[48px] min-w-[200px] max-w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 sm:text-base ${
    disabled
      ? 'cursor-not-allowed bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 opacity-80 shadow-blue-500/30'
      : 'bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 shadow-blue-500/30 hover:scale-[1.02] hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 hover:shadow-xl hover:shadow-blue-600/40 active:scale-[0.98]'
  }`;
}

function ArtifactsStatusBanner({
  cta,
  artifacts,
  summaryReady,
  photoReady,
  t,
}: {
  cta: TelegramResultsCta;
  artifacts?: GameResultsArtifacts | null;
  summaryReady: boolean;
  photoReady: boolean;
  t: TFunction;
}) {
  if (cta === 'send' || !artifacts) return null;

  if (cta === 'preparing') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
      >
        <p className="font-medium">{t('gameResults.artifactsPreparingTitle')}</p>
        <p className="mt-1 text-blue-800/90 dark:text-blue-200/90">
          {t('gameResults.artifactsPreparingDetail', {
            summary: stepLabel(summaryReady, t),
            photo: stepLabel(photoReady, t),
          })}
        </p>
      </div>
    );
  }

  if (cta === 'prepare' && artifacts.status === 'failed') {
    return (
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
      >
        <p className="font-medium">{t('gameResults.artifactsGenerationFailed')}</p>
        <p className="mt-1 text-red-800/90 dark:text-red-200/90">
          {t('gameResults.artifactsPrepareHint')}
        </p>
      </div>
    );
  }

  if (cta === 'prepare') {
    return (
      <div
        role="status"
        className="w-full max-w-md rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
      >
        <p>{t('gameResults.artifactsPrepareHint')}</p>
      </div>
    );
  }

  return null;
}

function SendButtonContent({ isSending, t }: { isSending: boolean; t: TFunction }) {
  if (isSending) {
    return <SendingDots t={t} />;
  }
  return (
    <>
      <Send size={18} className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      <span className="max-w-[220px] text-center leading-tight">{t('gameResults.sendResultsToTelegram')}</span>
    </>
  );
}

function PrepareButtonContent({
  cta,
  isPreparing,
  t,
}: {
  cta: TelegramResultsCta;
  isPreparing: boolean;
  t: TFunction;
}) {
  if (isPreparing || cta === 'preparing') {
    return (
      <>
        <Loader2 size={18} className="shrink-0 animate-spin" aria-hidden />
        <span className="max-w-[220px] text-center leading-tight">{t('gameResults.preparingResults')}</span>
      </>
    );
  }
  return (
    <>
      <Sparkles size={18} className="shrink-0" aria-hidden />
      <span className="max-w-[220px] text-center leading-tight">{t('gameResults.prepareResultsSummary')}</span>
    </>
  );
}

function SendingDots({ t }: { t: TFunction }) {
  return (
    <>
      <span className="h-2 w-2 rounded-full bg-white wavy-dot-1" />
      <span className="h-2 w-2 rounded-full bg-white wavy-dot-2" />
      <span className="h-2 w-2 rounded-full bg-white wavy-dot-3" />
      <span className="h-2 w-2 rounded-full bg-white wavy-dot-4" />
      <span className="h-2 w-2 rounded-full bg-white wavy-dot-5" />
      <span className="sr-only">{t('gameResults.sendingToTelegram')}</span>
    </>
  );
}
