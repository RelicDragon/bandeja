import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parse } from 'date-fns';
import { CalendarPlus, ChevronRight, RotateCcw, SearchX, Users } from 'lucide-react';
// Direct imports, not the `@/components` barrel — see `EmptyStateCard`.
import { Button } from '@/components/Button';
import { getAppDateFnsLocale } from '@/utils/dateFormat';
import { useOptionalPlayIntentContext } from '@/components/playIntent/PlayIntentContext';
import { EmptyStateCard } from './EmptyStateCard';
import { relateDayToToday } from './findRecoveryActions';
import type { LookingCountDisplay } from './lookingCount';

export type FindRecoveryLooking = LookingCountDisplay & { cityName: string };

interface FindRecoveryEmptyStateProps {
  title: string;
  /** Day the create action prefills, `yyyy-MM-dd`. */
  createDay: string;
  /** Today in the Home-city timezone; decides "today" / "tomorrow" / "on {day}". */
  todayKey: string;
  canClearFilters: boolean;
  onCreate: () => void;
  onClearFilters: () => void;
  /** `null` hides the line entirely: no count below three, no "nobody yet" copy. */
  looking?: FindRecoveryLooking | null;
  /**
   * Opens the court lobby (the intent editor when not looking). Defaults to
   * the surrounding play-intent provider; plain text when there is neither.
   */
  onOpenLobby?: () => void;
}

/**
 * PRD 363 — the Find empty state with a next step.
 *
 * Title (from `resolveFindEmptyMessage`), one optional line with the number
 * of people looking to play that opens the lobby, and up to two stacked
 * full-width actions: create a game on the day the screen is about, and clear
 * the filters that could be hiding games. Never empty of actions.
 */
export function FindRecoveryEmptyState({
  title,
  createDay,
  todayKey,
  canClearFilters,
  onCreate,
  onClearFilters,
  looking = null,
  onOpenLobby,
}: FindRecoveryEmptyStateProps) {
  const { t, i18n } = useTranslation();
  const playIntentUi = useOptionalPlayIntentContext();
  const openLobby = useMemo(() => {
    if (onOpenLobby) return onOpenLobby;
    if (!playIntentUi?.enabled) return undefined;
    return () => (playIntentUi.looking ? playIntentUi.openLobby() : playIntentUi.openCompose());
  }, [onOpenLobby, playIntentUi]);

  const createLabel = useMemo(() => {
    const relation = relateDayToToday(createDay, todayKey);
    if (relation === 'today') {
      return t('games.recovery.createToday', { defaultValue: 'Create a game today' });
    }
    if (relation === 'tomorrow') {
      return t('games.recovery.createTomorrow', { defaultValue: 'Create a game tomorrow' });
    }
    const date = parse(createDay, 'yyyy-MM-dd', new Date());
    const day = Number.isNaN(date.getTime())
      ? createDay
      : format(date, 'EEE d MMM', { locale: getAppDateFnsLocale(i18n.language) });
    return t('games.recovery.createOn', { day, defaultValue: `Create a game on ${day}` });
  }, [createDay, todayKey, t, i18n.language]);

  const lookingText = looking
    ? t(
        looking.window === 'todayAndTomorrow'
          ? 'games.recovery.lookingTodayAndTomorrow'
          : 'games.recovery.lookingToday',
        {
          count: looking.count,
          city: looking.cityName,
          defaultValue:
            looking.window === 'todayAndTomorrow'
              ? `${looking.count} people are looking to play today and tomorrow in ${looking.cityName}`
              : `${looking.count} people are looking to play today in ${looking.cityName}`,
        },
      )
    : null;

  const description = lookingText ? (
    openLobby ? (
      <button
        type="button"
        onClick={openLobby}
        data-testid="find-recovery-looking"
        className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400 dark:hover:bg-primary-950/40"
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-start leading-snug">{lookingText}</span>
        <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden />
      </button>
    ) : (
      <span data-testid="find-recovery-looking">{lookingText}</span>
    )
  ) : undefined;

  return (
    <EmptyStateCard
      icon={SearchX}
      title={title}
      description={description}
      action={
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onCreate}
            data-testid="find-recovery-create"
            className="min-h-11 w-full text-center leading-snug"
          >
            <CalendarPlus className="h-4 w-4 shrink-0" aria-hidden />
            <span>{createLabel}</span>
          </Button>
          {canClearFilters && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onClearFilters}
              data-testid="find-recovery-clear"
              className="min-h-11 w-full text-center leading-snug"
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
              <span>{t('games.recovery.clearFilters', { defaultValue: 'Clear filters' })}</span>
            </Button>
          )}
        </div>
      }
    />
  );
}
