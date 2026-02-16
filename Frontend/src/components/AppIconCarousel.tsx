import { useTranslation } from 'react-i18next';
import { APP_ICONS, type AppIconId } from '@/config/appIcons';

interface AppIconCarouselProps {
  value: AppIconId | null | undefined;
  onChange: (id: AppIconId) => void;
  disabled?: boolean;
}

export const AppIconCarousel = ({ value, onChange, disabled }: AppIconCarouselProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {APP_ICONS.map((icon) => {
        const isSelected = (value || 'tiger') === icon.id;
        const name = t(`profile.${icon.id}`);
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
              src={icon.previewUrl}
              alt={name}
              className="w-14 h-14 object-contain rounded-lg"
            />
          </button>
        );
      })}
    </div>
  );
};
