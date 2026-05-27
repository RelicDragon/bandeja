import { Loader2, Send, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameResultsArtifacts } from '@/types';
import {
  canShowPhotoGenerationAction,
  isAnyArtifactGenerating,
  isPhotoReadyForTelegram,
  isSummaryReadyForTelegram,
} from '@/utils/gameResultsArtifacts.util';

type ResultsArtifactsTelegramBlockProps = {
  artifacts?: GameResultsArtifacts | null;
  hasSummaryText: boolean;
  hasGamePhoto: boolean;
  isSending: boolean;
  isStartingGeneration: boolean;
  onSend: () => void;
  onGeneratePhoto: () => void;
  onGenerateSummary: () => void;
};

export function ResultsArtifactsTelegramBlock({
  artifacts,
  hasSummaryText,
  hasGamePhoto,
  isSending,
  isStartingGeneration,
  onSend,
  onGeneratePhoto,
  onGenerateSummary,
}: ResultsArtifactsTelegramBlockProps) {
  const { t } = useTranslation();

  const summaryReady = isSummaryReadyForTelegram(artifacts, hasSummaryText);
  const photoReady = isPhotoReadyForTelegram(artifacts, hasGamePhoto);
  const canGeneratePhoto = canShowPhotoGenerationAction(artifacts);
  const isGenerating =
    isStartingGeneration ||
    isAnyArtifactGenerating(artifacts, { hasSummaryText, hasGamePhoto });
  const isBusy = isSending || isGenerating;

  const showPhotoBtn = canGeneratePhoto;
  const showSummaryBtn = !summaryReady;
  const photoBtnLabel = photoReady
    ? t('gameResults.regeneratePhoto')
    : t('gameResults.generatePhoto');
  const showGenerateRow = showPhotoBtn || showSummaryBtn;

  return (
    <div className="mb-6 w-full max-w-md mx-auto flex flex-col gap-2 px-2">
      {isGenerating ? <ArtifactsGeneratingAnimation t={t} /> : null}

      <button
        type="button"
        onClick={onSend}
        disabled={isBusy}
        aria-busy={isSending}
        className={telegramPrimaryButtonClass(isBusy)}
      >
        <SendButtonContent isSending={isSending} t={t} />
      </button>

      {showGenerateRow ? (
        <div
          className={
            showPhotoBtn && showSummaryBtn ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1'
          }
        >
          {showPhotoBtn ? (
            <button
              type="button"
              onClick={onGeneratePhoto}
              disabled={isBusy}
              className={telegramSecondaryButtonClass(isBusy)}
            >
              <Wand2 size={16} className="shrink-0" aria-hidden />
              <span>{photoBtnLabel}</span>
            </button>
          ) : null}
          {showSummaryBtn ? (
            <button
              type="button"
              onClick={onGenerateSummary}
              disabled={isBusy}
              className={telegramSecondaryButtonClass(isBusy)}
            >
              <Wand2 size={16} className="shrink-0" aria-hidden />
              <span>{t('gameResults.generateSummary')}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ArtifactsGeneratingAnimation({ t }: { t: (key: string) => string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-4 py-4 dark:border-violet-800/60 dark:from-violet-950/40 dark:via-gray-900 dark:to-indigo-950/30"
    >
      <div className="relative flex h-10 w-10 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/25" />
        <span className="absolute inset-1 animate-pulse rounded-full bg-indigo-400/20" />
        <Loader2 className="relative h-6 w-6 animate-spin text-violet-600 dark:text-violet-300" aria-hidden />
      </div>
      <p className="text-center text-sm font-medium text-violet-900 dark:text-violet-100">
        {t('gameResults.artifactsGenerating')}
      </p>
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-violet-500 wavy-dot-1" />
        <span className="h-2 w-2 rounded-full bg-indigo-500 wavy-dot-2" />
        <span className="h-2 w-2 rounded-full bg-violet-500 wavy-dot-3" />
        <span className="h-2 w-2 rounded-full bg-indigo-500 wavy-dot-4" />
        <span className="h-2 w-2 rounded-full bg-violet-500 wavy-dot-5" />
      </div>
    </div>
  );
}

function telegramPrimaryButtonClass(disabled: boolean): string {
  return `group flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 sm:text-base ${
    disabled
      ? 'cursor-not-allowed bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 opacity-80 shadow-blue-500/30'
      : 'bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 shadow-blue-500/30 hover:scale-[1.01] hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 hover:shadow-xl hover:shadow-blue-600/40 active:scale-[0.99]'
  }`;
}

function telegramSecondaryButtonClass(disabled: boolean): string {
  return `flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
    disabled
      ? 'cursor-not-allowed border-violet-200/60 bg-violet-50/50 text-violet-400 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-500'
      : 'border-violet-200 bg-white text-violet-900 shadow-sm hover:border-violet-300 hover:bg-violet-50 active:scale-[0.99] dark:border-violet-800 dark:bg-gray-900 dark:text-violet-100 dark:hover:bg-violet-950/50'
  }`;
}

function SendButtonContent({
  isSending,
  t,
}: {
  isSending: boolean;
  t: (key: string) => string;
}) {
  if (isSending) {
    return <SendingDots t={t} />;
  }
  return (
    <>
      <Send size={18} className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      <span className="text-center leading-tight">{t('gameResults.sendResultsToTelegram')}</span>
    </>
  );
}

function SendingDots({ t }: { t: (key: string) => string }) {
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
