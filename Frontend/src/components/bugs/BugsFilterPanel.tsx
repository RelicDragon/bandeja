import { useTranslation } from 'react-i18next';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { ALL_BUG_STATUSES } from '@/components/bugs/bugsFilterParams';
import type { BugStatus, BugType } from '@/types';

const BUG_TYPES: BugType[] = ['BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION', 'TASK'];

export const BugsFilterPanel = () => {
  const { t } = useTranslation();
  const { bugsFilter, setBugsFilter } = useGameDetailsChromeStore();

  const toggleStatus = (status: BugStatus) => {
    setBugsFilter((prev) => {
      const selected = prev.statuses.includes(status);
      if (selected && prev.statuses.length === 1) return prev;
      const statuses = selected
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status];
      return { ...prev, statuses };
    });
  };

  const selectType = (type: BugType) => {
    if (!bugsFilter.createdByMe) return;
    setBugsFilter((prev) => ({
      ...prev,
      type: prev.type === type ? null : type,
    }));
  };

  const toggleCreatedByMe = () => {
    setBugsFilter((prev) => {
      const createdByMe = !prev.createdByMe;
      return {
        ...prev,
        createdByMe,
        type: createdByMe ? prev.type : null,
      };
    });
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {t('bug.myBugsOnly', { defaultValue: 'Created by me' })}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={bugsFilter.createdByMe}
            onClick={toggleCreatedByMe}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              bugsFilter.createdByMe ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                bugsFilter.createdByMe ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            {t('bug.status', { defaultValue: 'Status' })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_BUG_STATUSES.map((status) => {
              const active = bugsFilter.statuses.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-500 text-white dark:bg-blue-600'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                  }`}
                >
                  {t(`bug.statuses.${status}`)}
                </button>
              );
            })}
          </div>
        </div>
        {bugsFilter.createdByMe && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              {t('bug.type', { defaultValue: 'Type' })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BUG_TYPES.map((type) => {
                const active = bugsFilter.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => selectType(type)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      active
                        ? 'bg-blue-500 text-white dark:bg-blue-600'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                    }`}
                  >
                    {t(`bug.types.${type}`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
