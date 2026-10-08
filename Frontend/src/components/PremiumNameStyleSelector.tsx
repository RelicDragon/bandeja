import { useId } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PremiumNameStyle } from '@/types';
import { PREMIUM_NAME_STYLES, premiumNameClassName } from '@/utils/premiumIdentity';
import '@/styles/premium-name.css';
import './PremiumNameStyleSelector.css';

interface PremiumNameStyleSelectorProps {
  value: PremiumNameStyle;
  onChange: (value: PremiumNameStyle) => void;
  /** The member's own first name, previewed in every style. */
  name: string;
  disabled?: boolean;
  /** `showPremiumStatus` is off: still selectable, but nobody else sees it. */
  hidden?: boolean;
}

const LABEL_KEYS: Record<PremiumNameStyle, string> = {
  gold: 'profile.nameStyleGold',
  platinum: 'profile.nameStylePlatinum',
  rose: 'profile.nameStyleRose',
  ember: 'profile.nameStyleEmber',
  aurora: 'profile.nameStyleAurora',
  neon: 'profile.nameStyleNeon',
  holo: 'profile.nameStyleHolo',
  frost: 'profile.nameStyleFrost',
};

/**
 * Premium name style picker (Profile → Appearance). Each tile previews the
 * member's own name on a light and a dark strip; the selected tile runs the
 * hero sheen. Spec: docs/domains/premium-appearance.md § Name styles.
 */
export function PremiumNameStyleSelector({ value, onChange, name, disabled = false, hidden = false }: PremiumNameStyleSelectorProps) {
  const { t } = useTranslation();
  const group = useId();
  const hintId = useId();
  const preview = name.trim() || t('profile.nameStylePreviewFallback');

  return (
    <fieldset
      className={`premium-name-style-selector${hidden ? ' premium-name-style-selector--hidden' : ''}`}
      disabled={disabled}
      aria-busy={disabled}
      aria-describedby={hintId}
    >
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('profile.nameStyle')}</legend>
      <p id={hintId} className="mt-0.5 mb-2 text-xs text-gray-500 dark:text-gray-400">
        {t(hidden ? 'profile.nameStyleHiddenHint' : 'profile.nameStyleDescription')}
      </p>
      <div className="pns-options">
        {PREMIUM_NAME_STYLES.map((style) => {
          const selected = value === style;
          return (
            <label key={style} className="pns-option">
              <input
                type="radio"
                name={group}
                value={style}
                checked={selected}
                onChange={() => onChange(style)}
                className="sr-only"
              />
              <span className="pns-choice">
                <span className="pns-swatch" aria-hidden="true">
                  <span className="pns-strip pns-strip--light">
                    <span className={`pns-name ${premiumNameClassName(style, { tone: 'light', animated: selected })}`}>{preview}</span>
                  </span>
                  <span className="pns-strip pns-strip--dark">
                    <span className={`pns-name ${premiumNameClassName(style, { tone: 'dark', animated: selected })}`}>{preview}</span>
                  </span>
                </span>
                <span className="pns-caption">
                  <span className="truncate">{t(LABEL_KEYS[style])}</span>
                  <span className="pns-check" aria-hidden="true">
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
