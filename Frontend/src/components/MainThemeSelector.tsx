import { useId } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MainTheme } from '@/types';
import type { MemberThemeId } from '@/utils/mainTheme';
import { MemberCrest } from '@/components/navigation/MemberCrest';
import './MainThemeSelector.css';

interface MainThemeSelectorProps {
  value: MainTheme;
  onChange: (value: MainTheme) => void;
  disabled?: boolean;
}

/** Picker order (light, warm scenes first; every member theme must appear). */
const THEMES = ['classic', 'premium', 'spring', 'summer', 'alpine', 'nordic', 'ocean', 'woodstone', 'steampunk', 'cyberpunk'] as const satisfies readonly ('classic' | MemberThemeId)[];

/** Each preview phone carries `data-member-theme`, so the theme files paint a still preview with their own tokens. */
export function MainThemeSelector({ value, onChange, disabled = false }: MainThemeSelectorProps) {
  const { t } = useTranslation();
  const name = useId();

  return (
    <fieldset className="main-theme-selector" disabled={disabled} aria-busy={disabled}>
      <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('profile.mainTheme')}
      </legend>
      <div className="main-theme-options">
        {THEMES.map((theme) => {
          const selected = value === theme;
          return (
            <label key={theme} className="main-theme-option">
              <input
                type="radio"
                name={name}
                value={theme}
                checked={selected}
                onChange={() => onChange(theme)}
                className="sr-only"
              />
              <span className="main-theme-choice">
                <span
                  className={`main-theme-phone ${theme === 'classic' ? 'main-theme-phone--classic' : ''}`}
                  data-member-theme={theme === 'classic' ? undefined : theme}
                  aria-hidden="true"
                >
                  <span className="main-theme-phone-header">
                    {theme === 'classic'
                      ? <img className="main-theme-phone-crest" src="/bandeja2-blue-45-icon.png" alt="" />
                      : <MemberCrest theme={theme} className="main-theme-phone-crest" />}
                    <span className="main-theme-phone-wordmark" />
                  </span>
                  <span className="main-theme-phone-body">
                    <span className="main-theme-phone-card"><i /><b /></span>
                    <span className="main-theme-phone-card"><i /><b /></span>
                  </span>
                  <span className="main-theme-phone-tabs"><i /><i /><i /></span>
                </span>
                <span className="main-theme-caption">
                  <span className="main-theme-name">{t(`profile.mainThemes.${theme}`)}</span>
                  <span className="main-theme-check" aria-hidden="true">
                    {selected && <Check size={12} strokeWidth={3} />}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
