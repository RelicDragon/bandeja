import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, RotateCcw, Sparkles, Users } from 'lucide-react';
import { RangeSlider } from '@/components/RangeSlider';
import {
  PLAYER_INVITE_GAMES_TOGETHER_STEPS,
  PLAYER_INVITE_RATING_MAX,
  type PlayerInviteFilters,
  type PlayerInviteGenderFilter,
} from '@/components/playerInvite/playerInviteFilters';

interface PlayerListFilterBarProps {
  filters: PlayerInviteFilters;
  onChange: (next: PlayerInviteFilters) => void;
  socialLevelMax: number;
  genderLocked?: PlayerInviteGenderFilter | null;
  resultCount: number;
  totalCount: number;
}

export function PlayerListFilterBar({
  filters,
  onChange,
  socialLevelMax,
  genderLocked,
  resultCount,
  totalCount,
}: PlayerListFilterBarProps) {
  const { t } = useTranslation();

  const effectiveGender = genderLocked && genderLocked !== 'ALL' ? genderLocked : filters.gender;

  const hasActiveFilters = useMemo(() => {
    const levelWide = filters.levelRange[0] <= 0 && filters.levelRange[1] >= PLAYER_INVITE_RATING_MAX;
    const socialWide = filters.socialRange[0] <= 0 && filters.socialRange[1] >= socialLevelMax;
    const genderActive = !genderLocked && filters.gender !== 'ALL';
    return genderActive || !levelWide || !socialWide || filters.minGamesTogether > 0;
  }, [filters, genderLocked, socialLevelMax]);

  const resetAdjustable = () => {
    onChange({
      ...filters,
      gender: genderLocked && genderLocked !== 'ALL' ? genderLocked : 'ALL',
      levelRange: [0, PLAYER_INVITE_RATING_MAX],
      socialRange: [0, socialLevelMax],
      minGamesTogether: 0,
    });
  };

  const setGender = (g: PlayerInviteGenderFilter) => {
    if (genderLocked && genderLocked !== 'ALL') return;
    onChange({ ...filters, gender: g });
  };

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white via-gray-50/90 to-primary-50/30 p-3 shadow-sm dark:border-gray-700/60 dark:from-gray-900 dark:via-gray-900/95 dark:to-primary-950/25">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-gray-800 dark:text-gray-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300">
            <Filter className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-600/90 dark:text-primary-300/90">
              {t('playerInvite.filtersTitle')}
            </p>
            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
              {t('playerInvite.matchingCount', { shown: resultCount, total: totalCount })}
            </p>
          </div>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetAdjustable}
            className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-600 shadow-sm transition hover:border-primary-300 hover:text-primary-700 active:scale-[0.98] dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-primary-600 dark:hover:text-primary-200"
          >
            <RotateCcw className="h-3 w-3" />
            {t('playerInvite.reset')}
          </button>
        )}
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {t('playerInvite.gender')}
        </p>
        <div
          className={`flex rounded-xl bg-gray-100/90 p-0.5 dark:bg-gray-800/90 ${genderLocked && genderLocked !== 'ALL' ? 'opacity-90' : ''}`}
          role="group"
        >
          {(['ALL', 'MALE', 'FEMALE'] as const).map((g) => {
            const selected = effectiveGender === g;
            const disabled = Boolean(genderLocked && genderLocked !== 'ALL' && g !== genderLocked);
            return (
              <button
                key={g}
                type="button"
                disabled={disabled}
                onClick={() => setGender(g)}
                className={`relative flex-1 rounded-[10px] py-2 text-xs font-semibold transition-all ${
                  selected
                    ? 'bg-white text-gray-900 shadow-md shadow-gray-900/5 ring-1 ring-gray-200/80 dark:bg-gray-700 dark:text-white dark:shadow-black/20 dark:ring-gray-600'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                {g === 'ALL' && t('playerInvite.genderAll')}
                {g === 'MALE' && t('playerInvite.genderMale')}
                {g === 'FEMALE' && t('playerInvite.genderFemale')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-gray-100 bg-white/70 px-3 py-2.5 dark:border-gray-700/50 dark:bg-gray-800/40">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <Sparkles className="h-3 w-3 text-amber-500" />
          {t('playerInvite.rating')}
        </div>
        <RangeSlider
          min={0}
          max={PLAYER_INVITE_RATING_MAX}
          value={filters.levelRange}
          onChange={(v) => onChange({ ...filters, levelRange: v })}
        />
      </div>

      <div className="mb-3 rounded-xl border border-gray-100 bg-white/70 px-3 py-2.5 dark:border-gray-700/50 dark:bg-gray-800/40">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <Users className="h-3 w-3 text-sky-500" />
          {t('playerInvite.socialRating')}
        </div>
        <RangeSlider
          min={0}
          max={socialLevelMax}
          value={filters.socialRange}
          onChange={(v) => onChange({ ...filters, socialRange: v })}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {t('playerInvite.gamesTogether')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_INVITE_GAMES_TOGETHER_STEPS.map((min) => {
            const selected = filters.minGamesTogether === min;
            const label =
              min === 0 ? t('playerInvite.gamesTogetherAny') : t('playerInvite.gamesTogetherMin', { count: min });
            return (
              <button
                key={min}
                type="button"
                onClick={() => onChange({ ...filters, minGamesTogether: min })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  selected
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-600/25 dark:bg-primary-500 dark:shadow-primary-900/40'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
