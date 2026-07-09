import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '@/components';
import type { Sport, User } from '@/types';
import { usersApi } from '@/api';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { getSportConfig } from '@/sport/sportRegistry';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';
import {
  isSportQuestionnaireCompleted,
  isSportQuestionnaireSkipped,
} from '@/utils/sportQuestionnaire';
import { SportQuestionnaireSheet } from './SportQuestionnaireSheet';

type SportQuestionnaireProfileStatusProps = {
  user: User;
  sport: Sport;
  gamesPlayed: number;
  onUserUpdated?: (user: User) => void;
  className?: string;
};

type ProfileQuestionnaireState = 'notSet' | 'completed' | 'skipped';

function resolveProfileQuestionnaireState(
  user: User,
  sport: Sport,
  status: { completed: boolean; skipped: boolean } | null,
): ProfileQuestionnaireState {
  if (status?.completed || isSportQuestionnaireCompleted(user, sport)) return 'completed';
  if (status?.skipped || isSportQuestionnaireSkipped(user, sport)) return 'skipped';
  return 'notSet';
}

export function SportQuestionnaireProfileStatus({
  user,
  sport,
  gamesPlayed,
  onUserUpdated,
  className = '',
}: SportQuestionnaireProfileStatusProps) {
  const { t } = useTranslation();
  const { status, loading, refresh } = useQuestionnaireStatus(sport);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (gamesPlayed > 0 || !sportHasQuestionnaire(sport)) {
    return null;
  }

  if (loading) {
    return null;
  }

  const sportLabel = t(getSportConfig(sport).labelKey);
  const questionnaireState = resolveProfileQuestionnaireState(user, sport, status);
  const needsReset = questionnaireState === 'completed' || questionnaireState === 'skipped';

  const statusKey =
    questionnaireState === 'completed'
      ? 'profile.sports.questionnaire.completed'
      : questionnaireState === 'skipped'
        ? 'profile.sports.questionnaire.skipped'
        : 'profile.sports.questionnaire.notSet';

  const actionLabel =
    questionnaireState === 'completed'
      ? t('profile.sports.questionnaire.actionRetake')
      : t('profile.sports.questionnaire.actionFill');

  const handleAction = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (needsReset) {
        const res = await usersApi.resetSportQuestionnaire(sport);
        onUserUpdated?.(res.data);
        await refresh();
      }
      setSheetOpen(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={`w-full rounded-lg border border-sky-200/90 bg-gradient-to-br from-sky-50/90 to-white p-3 dark:border-sky-800/60 dark:from-sky-950/40 dark:to-slate-900/40 ${className}`}
      >
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
            <ClipboardList size={16} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">
              {t('profile.sports.questionnaire.title', { sport: sportLabel })}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-gray-600 dark:text-gray-400">
              {t(statusKey)}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="mt-3 w-full text-xs"
          disabled={busy}
          onClick={() => void handleAction()}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            actionLabel
          )}
        </Button>
      </div>
      <SportQuestionnaireSheet
        sport={sport}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCompleted={(updated) => {
          onUserUpdated?.(updated);
          void refresh();
        }}
      />
    </>
  );
}
