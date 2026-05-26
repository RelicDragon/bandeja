import type { TFunction } from 'i18next';
import { Loader2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameResultsArtifacts } from '@/types';
import {
  resolveResultsArtifactsTelegramUiState,
  type ResultsArtifactsTelegramUiState,
} from '@/utils/gameResultsArtifacts.util';

type ResultsArtifactsTelegramBlockProps = {
  artifacts?: GameResultsArtifacts | null;
  hasSummaryText: boolean;
  disabled: boolean;
  isSending: boolean;
  onSend: () => void;
};

function stepLabel(
  ready: boolean,
  t: TFunction
): string {
  return ready ? t('gameResults.artifactsStepDone') : t('gameResults.artifactsStepPending');
}

export function ResultsArtifactsTelegramBlock({
  artifacts,
  hasSummaryText,
  disabled,
  isSending,
  onSend,
}: ResultsArtifactsTelegramBlockProps) {
  const { t } = useTranslation();
  const uiState = resolveResultsArtifactsTelegramUiState(artifacts, hasSummaryText);

  return (
    <div className="mb-6 flex flex-col items-center gap-3 px-2">
      <ArtifactsStatusBanner
        uiState={uiState}
        artifacts={artifacts}
        t={t}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        aria-busy={isSending}
        className={`group flex min-h-[48px] min-w-[200px] max-w-full items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 sm:text-base ${
          disabled
            ? 'cursor-not-allowed bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 opacity-80 shadow-blue-500/30'
            : 'bg-gradient-to-r from-blue-500 via-blue-600 to-blue-600 shadow-blue-500/30 hover:scale-[1.02] hover:from-blue-600 hover:via-blue-700 hover:to-blue-700 hover:shadow-xl hover:shadow-blue-600/40 active:scale-[0.98]'
        }`}
      >
        <TelegramButtonContent uiState={uiState} isSending={isSending} t={t} />
      </button>
    </div>
  );
}

function ArtifactsStatusBanner({
  uiState,
  artifacts,
  t,
}: {
  uiState: ResultsArtifactsTelegramUiState;
  artifacts?: GameResultsArtifacts | null;
  t: TFunction;
}) {
  if (uiState === 'ready' || !artifacts) return null;

  if (uiState === 'preparing') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100"
      >
        <p className="font-medium">{t('gameResults.artifactsPreparingTitle')}</p>
        <p className="mt-1 text-blue-800/90 dark:text-blue-200/90">
          {t('gameResults.artifactsPreparingDetail', {
            summary: stepLabel(artifacts.summaryReady, t),
            photo: stepLabel(artifacts.photoReady, t),
          })}
        </p>
      </div>
    );
  }

  if (uiState === 'failed_degraded') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <p className="font-medium">{t('gameResults.artifactsPhotoFailedTitle')}</p>
        <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
          {t('gameResults.artifactsPhotoFailedSummaryReady')}
        </p>
      </div>
    );
  }

  if (uiState === 'failed') {
    return (
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
      >
        <p className="font-medium">{t('gameResults.artifactsGenerationFailed')}</p>
        <p className="mt-1 text-red-800/90 dark:text-red-200/90">
          {t('gameResults.artifactsGenerationFailedHint')}
        </p>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-md rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
    >
      <p>{t('gameResults.artifactsNotReadyYet')}</p>
    </div>
  );
}

function TelegramButtonContent({
  uiState,
  isSending,
  t,
}: {
  uiState: ResultsArtifactsTelegramUiState;
  isSending: boolean;
  t: TFunction;
}) {
  if (isSending) {
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

  if (uiState === 'preparing') {
    return (
      <>
        <Loader2 size={18} className="shrink-0 animate-spin" aria-hidden />
        <span className="max-w-[220px] text-center leading-tight">
          {t('gameResults.preparingResults')}
        </span>
      </>
    );
  }

  if (uiState === 'failed') {
    return (
      <span className="max-w-[220px] text-center leading-tight">
        {t('gameResults.artifactsGenerationFailed')}
      </span>
    );
  }

  if (uiState === 'waiting') {
    return (
      <span className="max-w-[220px] text-center leading-tight">
        {t('gameResults.artifactsNotReadyYet')}
      </span>
    );
  }

  return (
    <>
      <Send
        size={18}
        className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
        aria-hidden
      />
      <span className="max-w-[220px] text-center leading-tight">
        {t('gameResults.sendResultsToTelegram')}
      </span>
    </>
  );
}
