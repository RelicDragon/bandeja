import { useTranslation } from 'react-i18next';
import {
  APP_ICONS,
  getAppIconPreviewUrl,
  getMemberThemeAppIconPreviewUrl,
  type AppIconId,
} from '@/config/appIcons';
import { useAuthStore } from '@/store/authStore';
import type { Sport } from '@/types';
import { activeMemberTheme } from '@/utils/mainTheme';

interface AppIconCarouselProps {
  value: AppIconId | null | undefined;
  onChange: (id: AppIconId) => void;
  disabled?: boolean;
  primarySport?: Sport | null;
}

export const AppIconCarousel = ({ value, onChange, disabled, primarySport }: AppIconCarouselProps) => {
  const { t } = useTranslation();
  const memberTheme = useAuthStore((s) => activeMemberTheme(s.user));

  return (
    <div className="space-y-3">
      {memberTheme && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-primary-500 bg-primary-50 p-3 dark:bg-primary-900/20">
          <img
            src={getMemberThemeAppIconPreviewUrl(memberTheme)}
            alt=""
            className="h-14 w-14 shrink-0 rounded-[22%] object-cover"
          />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('profile.appIconFollowsTheme', { theme: t(`profile.mainThemes.${memberTheme}`) })}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-4 justify-center">
        {APP_ICONS.map((icon) => {
          const isSelected = !memberTheme && (value || 'tiger') === icon.id;
          const name = t(`profile.${icon.id}`);
          const previewUrl = getAppIconPreviewUrl(icon.id, primarySport);
          return (
            <button
              key={icon.id}
              type="button"
              onClick={() => !disabled && onChange(icon.id)}
              disabled={disabled}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
              aria-pressed={isSelected}
              aria-label={t('profile.appIcon') + ': ' + name}
            >
              <img
                src={previewUrl}
                alt={name}
                className="w-14 h-14 object-contain rounded-lg"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
