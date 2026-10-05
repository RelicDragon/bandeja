import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { USER_TEAM_COLORS, type UserTeamColor } from '@shared/userTeamColors';
import { USER_TEAM_COLOR_TONES } from '@/utils/userTeamColor';
import { pressScaleGuard } from '@/components/motion/pressScale';

type Props = {
  value: string | null | undefined;
  onChange: (color: UserTeamColor | null) => void;
  disabled?: boolean;
};

/** The app default follows the member's primary colour. */
const DEFAULT_SWATCH = {
  backgroundImage:
    'linear-gradient(135deg, var(--member-primary-500, #0ea5e9) 50%, var(--member-primary-700, #0369a1) 50%)',
};

/**
 * Team colour for a photo-less team: each swatch previews the two-tone split
 * the avatar will use. A radio group, so arrow keys and screen readers work.
 */
export function UserTeamColorPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const selected: UserTeamColor | null = (USER_TEAM_COLORS as readonly string[]).includes(value ?? '')
    ? (value as UserTeamColor)
    : null;
  const options: (UserTeamColor | null)[] = [null, ...USER_TEAM_COLORS];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span id="user-team-color-label" className="font-semibold text-zinc-800 dark:text-zinc-100">
          {t('teams.colorLabel')}
        </span>
        <span className="font-semibold text-primary-600 dark:text-primary-300" aria-hidden>
          {t(`teams.colors.${selected ?? 'default'}`)}
        </span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="user-team-color-label"
        className="mt-2.5 grid grid-cols-4 justify-items-center gap-x-3 gap-y-2.5"
        data-testid="user-team-color-picker"
      >
        {options.map((key) => {
          const isOn = key === selected;
          const style = key
            ? {
                backgroundImage: `linear-gradient(135deg, ${USER_TEAM_COLOR_TONES[key].light} 50%, ${USER_TEAM_COLOR_TONES[key].dark} 50%)`,
              }
            : DEFAULT_SWATCH;
          return (
            <button
              key={key ?? 'default'}
              type="button"
              role="radio"
              aria-checked={isOn}
              aria-label={t(`teams.colors.${key ?? 'default'}`)}
              disabled={disabled}
              onClick={() => {
                if (!isOn) onChange(key);
              }}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25),0_2px_6px_-2px_rgba(15,23,42,0.45)] outline-none transition-[scale,outline-color] duration-200 focus-visible:ring-2 focus-visible:ring-primary-500/60 active:scale-90 disabled:opacity-50 ${pressScaleGuard} ${
                isOn
                  ? 'scale-110 outline outline-2 outline-offset-2 outline-zinc-900/75 dark:outline-white/85'
                  : 'hover:scale-105'
              }`}
              style={style}
            >
              {isOn ? <Check size={15} strokeWidth={3} className="text-white drop-shadow" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
