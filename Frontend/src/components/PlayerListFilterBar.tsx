import { useTranslation } from 'react-i18next';
import { Sparkles, Users } from 'lucide-react';
import { RangeSlider } from '@/components/RangeSlider';
import { Button } from '@/components/Button';
import {
  PLAYER_INVITE_GAMES_TOGETHER_STEPS,
  PLAYER_INVITE_RATING_MIN,
  PLAYER_INVITE_RATING_MAX,
  type PlayerInviteFilters,
  type PlayerInviteGenderFilter,
} from '@/components/playerInvite/playerInviteFilters';

interface PlayerListFilterBarProps {
  filters: PlayerInviteFilters;
  onChange: (next: PlayerInviteFilters) => void;
  socialLevelMax: number;
  genderLocked?: PlayerInviteGenderFilter | null;
  onApplyClose?: () => void;
}

export function PlayerListFilterBar({
  filters,
  onChange,
  socialLevelMax,
  genderLocked,
  onApplyClose,
}: PlayerListFilterBarProps) {
  const { t } = useTranslation();

  const effectiveGender = genderLocked && genderLocked !== 'ALL' ? genderLocked : filters.gender;

  const setGender = (g: PlayerInviteGenderFilter) => {
    if (genderLocked && genderLocked !== 'ALL') return;
    onChange({ ...filters, gender: g });
  };

  return (
    <div className="mb-3 rounded-2xl border border-gray-200/80 bg-gradient-to-br from-white via-gray-50/90 to-primary-50/30 px-4 py-3 shadow-sm dark:border-gray-700/60 dark:from-gray-900 dark:via-gray-900/95 dark:to-primary-950/25">
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

      <div className="mb-2 rounded-lg border border-gray-100 bg-white/70 px-3 py-2 dark:border-gray-700/50 dark:bg-gray-800/40">
        <div className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <Sparkles className="h-2.5 w-2.5 shrink-0 text-amber-500" />
          {t('playerInvite.rating')}
        </div>
        <RangeSlider
          compact
          min={PLAYER_INVITE_RATING_MIN}
          max={PLAYER_INVITE_RATING_MAX}
          value={filters.levelRange}
          onChange={(v) => onChange({ ...filters, levelRange: v })}
        />
      </div>

      <div className="mb-2 rounded-lg border border-gray-100 bg-white/70 px-3 py-2 dark:border-gray-700/50 dark:bg-gray-800/40">
        <div className="mb-0.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          <Users className="h-2.5 w-2.5 shrink-0 text-sky-500" />
          {t('playerInvite.socialRating')}
        </div>
        <RangeSlider
          compact
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

      {onApplyClose && (
        <div className="mt-3 border-t border-gray-200/80 pt-3 dark:border-gray-700/60">
          <Button type="button" onClick={onApplyClose} className="w-full rounded-xl py-2.5 text-sm font-semibold">
            {t('playerInvite.applyFilters')}
          </Button>
        </div>
      )}
    </div>
  );
}
