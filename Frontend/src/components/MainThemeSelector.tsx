import { useId } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { User } from '@/types';
import './MainThemeSelector.css';

interface MainThemeSelectorProps {
  value: NonNullable<User['mainTheme']>;
  onChange: (value: NonNullable<User['mainTheme']>) => void;
  disabled?: boolean;
}

export function MainThemeSelector({ value, onChange, disabled = false }: MainThemeSelectorProps) {
  const { t } = useTranslation();
  const name = useId();

  return (
    <fieldset className="main-theme-selector" disabled={disabled} aria-busy={disabled}>
      <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('profile.mainTheme')}
      </legend>
      <div className="main-theme-options">
        {(['classic', 'premium'] as const).map((theme) => (
          <label key={theme} className={`main-theme-option main-theme-option--${theme}`}>
            <input
              type="radio"
              name={name}
              value={theme}
              checked={value === theme}
              onChange={() => onChange(theme)}
              className="sr-only"
            />
            <span className="main-theme-choice">
              <span className="main-theme-preview" aria-hidden="true">
                <span className="main-theme-preview-header">
                  <img
                    src={theme === 'premium' ? '/premium/bandeja-gold-crest.webp' : '/bandeja2-blue-45-icon.png'}
                    alt=""
                  />
                  <span>BANDEJA</span>
                </span>
                <span className="main-theme-preview-content">
                  <span className="main-theme-preview-line" />
                  <span className="main-theme-preview-row"><i /><i /><i /></span>
                  <span className="main-theme-preview-nav"><i /><i /><i /></span>
                </span>
              </span>
              <span className="main-theme-caption">
                <span>{t(theme === 'premium' ? 'profile.mainThemePremium' : 'profile.mainThemeClassic')}</span>
                <span className="main-theme-check" aria-hidden="true">
                  {value === theme && <Check size={14} strokeWidth={2.5} />}
                </span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
