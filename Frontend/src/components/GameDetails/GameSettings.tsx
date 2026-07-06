import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, ToggleSwitch } from '@/components';
import { Game } from '@/types';
import { Settings, HelpCircle, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShowSettingsNotes } from '@/hooks/useShowSettingsNotes';
import { gamesApi, normalizeGameFromApi } from '@/api';
import toast from 'react-hot-toast';

interface GameSettingsProps {
  game: Game;
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
  /** Inside EditGameInfoModal — no outer card/title chrome. */
  embedded?: boolean;
}

type SettingKey =
  | 'affectsRating'
  | 'isPublic'
  | 'anyoneCanInvite'
  | 'resultsByAnyone'
  | 'allowDirectJoin'
  | 'afterGameGoToBar';

const ERROR_CLEAR_MS = 5000;
const SUCCESS_SHOW_MS = 1000;

function readSetting(game: Game, key: SettingKey): boolean {
  return game[key] ?? false;
}

interface SettingToggleRowProps {
  title: string;
  checked: boolean;
  hasError: boolean;
  showSuccess: boolean;
  disabled: boolean;
  note?: ReactNode;
  onChange: (checked: boolean) => void;
}

function SettingToggleRow({
  title,
  checked,
  hasError,
  showSuccess,
  disabled,
  note,
  onChange,
}: SettingToggleRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`px-1 py-1 rounded-lg transition-colors ${
        hasError
          ? 'bg-red-50 dark:bg-red-950/25 ring-1 ring-red-300 dark:ring-red-800/80'
          : 'bg-gray-50 dark:bg-gray-800/50'
      }`}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
        <span
          className={`text-sm font-medium min-w-0 col-start-1 row-start-1 ${
            hasError ? 'text-red-800 dark:text-red-200' : 'text-gray-800 dark:text-gray-200'
          }`}
        >
          {title}
        </span>
        <div className="relative col-start-2 row-start-1 flex-shrink-0 self-center pr-1">
          <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
          <AnimatePresence>
            {showSuccess ? (
              <motion.span
                key="saved"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="pointer-events-none absolute -right-0.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white shadow-md ring-2 ring-white dark:ring-gray-900"
                aria-hidden
              >
                <Check size={11} strokeWidth={3} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {hasError ? (
            <motion.p
              key="error"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="col-start-1 row-start-2 min-w-0 overflow-hidden text-xs text-red-600 dark:text-red-400"
            >
              {t('gameDetails.settings.saveFailed')}
            </motion.p>
          ) : note ? (
            <motion.div
              key="note"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="col-start-1 row-start-2 min-w-0 overflow-hidden"
            >
              {note}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const GameSettings = ({ game, canEdit, onGameUpdate, embedded = false }: GameSettingsProps) => {
  const { t } = useTranslation();
  const { showNotes, toggleShowNotes } = useShowSettingsNotes();
  const [optimistic, setOptimistic] = useState<Partial<Record<SettingKey, boolean>>>({});
  const [errorFields, setErrorFields] = useState<Set<SettingKey>>(() => new Set());
  const [successFields, setSuccessFields] = useState<Set<SettingKey>>(() => new Set());
  const isLeagueSeason = game.entityType === 'LEAGUE_SEASON';
  const isTraining = game.entityType === 'TRAINING';
  const settingsTitle = t(isLeagueSeason ? 'createGame.settingsLeague' : 'createGame.settings');
  const canChangeSettings = canEdit && game.resultsStatus === 'NONE' && game.status !== 'ARCHIVED';

  useEffect(() => {
    setOptimistic((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(prev) as SettingKey[]) {
        if (prev[key] === readSetting(game, key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [game]);

  const getChecked = useCallback(
    (key: SettingKey) => (key in optimistic ? optimistic[key]! : readSetting(game, key)),
    [game, optimistic],
  );

  const markFieldError = useCallback((key: SettingKey) => {
    setErrorFields((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setErrorFields((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, ERROR_CLEAR_MS);
  }, []);

  const markFieldSuccess = useCallback((key: SettingKey) => {
    setSuccessFields((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setSuccessFields((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, SUCCESS_SHOW_MS);
  }, []);

  const persistSetting = useCallback(
    async (key: SettingKey, checked: boolean) => {
      if (!canChangeSettings) return;

      setOptimistic((prev) => ({ ...prev, [key]: checked }));
      setErrorFields((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      try {
        const result = await gamesApi.update(game.id, { [key]: checked });
        onGameUpdate(normalizeGameFromApi(result.data));
        markFieldSuccess(key);
      } catch (error: unknown) {
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        markFieldError(key);
        const err = error as { response?: { data?: { message?: string } } };
        const errorMessage = err.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    },
    [canChangeSettings, game.id, markFieldError, markFieldSuccess, onGameUpdate, t],
  );

  if (!canEdit) {
    return null;
  }

  const toggleDisabled = !canChangeSettings;

  const notesToggle = (
    <button
      type="button"
      onClick={toggleShowNotes}
      className={`p-2 rounded-lg transition-all duration-300 ease-in-out shadow-sm hover:shadow-md ${
        showNotes
          ? 'bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 border border-primary-600 dark:border-primary-600 shadow-primary-100 dark:shadow-primary-900/20'
          : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'
      }`}
      title={showNotes ? t('common.hideNotes') : t('common.showNotes')}
    >
      <HelpCircle size={18} className={showNotes ? 'text-white' : 'text-gray-600 dark:text-gray-300'} />
    </button>
  );

  const toggleList = (
    <div className="space-y-2">
        {!isLeagueSeason && !isTraining && game.entityType !== 'BAR' && (
          <SettingToggleRow
            title={t('createGame.ratingGame.title')}
            checked={getChecked('affectsRating')}
            hasError={errorFields.has('affectsRating')}
            showSuccess={successFields.has('affectsRating')}
            disabled={toggleDisabled}
            onChange={(checked) => void persistSetting('affectsRating', checked)}
            note={
              showNotes ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getChecked('affectsRating')
                    ? t('createGame.ratingGame.note.true')
                    : t('createGame.ratingGame.note.false')}
                </p>
              ) : undefined
            }
          />
        )}

        <SettingToggleRow
          title={isTraining ? t('createGame.publicGame.titleTraining') : t('createGame.publicGame.title')}
          checked={getChecked('isPublic')}
          hasError={errorFields.has('isPublic')}
          showSuccess={successFields.has('isPublic')}
          disabled={toggleDisabled}
          onChange={(checked) => void persistSetting('isPublic', checked)}
          note={
            showNotes ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {getChecked('isPublic')
                  ? isTraining
                    ? t('createGame.publicGame.noteTraining.true')
                    : t('createGame.publicGame.note.true')
                  : isTraining
                    ? t('createGame.publicGame.noteTraining.false')
                    : t('createGame.publicGame.note.false')}
              </p>
            ) : undefined
          }
        />

        <SettingToggleRow
          title={
            isTraining ? t('createGame.anyoneCanInvite.titleTraining') : t('createGame.anyoneCanInvite.title')
          }
          checked={getChecked('anyoneCanInvite')}
          hasError={errorFields.has('anyoneCanInvite')}
          showSuccess={successFields.has('anyoneCanInvite')}
          disabled={toggleDisabled}
          onChange={(checked) => void persistSetting('anyoneCanInvite', checked)}
          note={
            showNotes ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {getChecked('anyoneCanInvite')
                  ? isTraining
                    ? t('createGame.anyoneCanInvite.noteTraining.true')
                    : t('createGame.anyoneCanInvite.note.true')
                  : isTraining
                    ? t('createGame.anyoneCanInvite.noteTraining.false')
                    : t('createGame.anyoneCanInvite.note.false')}
              </p>
            ) : undefined
          }
        />

        {!isLeagueSeason && game.entityType !== 'TOURNAMENT' && !isTraining && (
          <SettingToggleRow
            title={t('createGame.resultsByAnyone.title')}
            checked={getChecked('resultsByAnyone')}
            hasError={errorFields.has('resultsByAnyone')}
            showSuccess={successFields.has('resultsByAnyone')}
            disabled={toggleDisabled}
            onChange={(checked) => void persistSetting('resultsByAnyone', checked)}
            note={
              showNotes ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getChecked('resultsByAnyone')
                    ? t('createGame.resultsByAnyone.note.true')
                    : t('createGame.resultsByAnyone.note.false')}
                </p>
              ) : undefined
            }
          />
        )}

        <SettingToggleRow
          title={
            isTraining ? t('createGame.allowDirectJoin.titleTraining') : t('createGame.allowDirectJoin.title')
          }
          checked={getChecked('allowDirectJoin')}
          hasError={errorFields.has('allowDirectJoin')}
          showSuccess={successFields.has('allowDirectJoin')}
          disabled={toggleDisabled}
          onChange={(checked) => void persistSetting('allowDirectJoin', checked)}
          note={
            showNotes ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {getChecked('allowDirectJoin')
                  ? isTraining
                    ? t('createGame.allowDirectJoin.noteTraining.true')
                    : t('createGame.allowDirectJoin.note.true')
                  : isTraining
                    ? t('createGame.allowDirectJoin.noteTraining.false')
                    : t('createGame.allowDirectJoin.note.false')}
              </p>
            ) : undefined
          }
        />

        {game.entityType !== 'BAR' && (
          <SettingToggleRow
            title={
              isTraining
                ? t('createGame.afterGameGoToBar.titleTraining')
                : t('createGame.afterGameGoToBar.title')
            }
            checked={getChecked('afterGameGoToBar')}
            hasError={errorFields.has('afterGameGoToBar')}
            showSuccess={successFields.has('afterGameGoToBar')}
            disabled={toggleDisabled}
            onChange={(checked) => void persistSetting('afterGameGoToBar', checked)}
            note={
              showNotes ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getChecked('afterGameGoToBar')
                    ? isTraining
                      ? t('createGame.afterGameGoToBar.noteTraining.true')
                      : t('createGame.afterGameGoToBar.note.true')
                    : isTraining
                      ? t('createGame.afterGameGoToBar.noteTraining.false')
                      : t('createGame.afterGameGoToBar.note.false')}
                </p>
              ) : undefined
            }
          />
        )}
    </div>
  );

  if (embedded) {
    return (
      <div>
        <div className="flex justify-end mb-3">{notesToggle}</div>
        {toggleList}
      </div>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="section-title">{settingsTitle}</h2>
          {notesToggle}
        </div>
      </div>
      {toggleList}
    </Card>
  );
};
