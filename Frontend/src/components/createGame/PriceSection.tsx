import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PriceType, PriceCurrency } from '@/types';
import { Select } from '@/components';
import { getCurrencyOptions, getCurrencySymbol, resolveUserCurrency } from '@/utils/currency';

interface PriceSectionProps {
  priceTotal: number | undefined;
  priceType: PriceType;
  priceCurrency: PriceCurrency | undefined;
  defaultCurrency?: PriceCurrency | null;
  onPriceTotalChange: (value: number | undefined) => void;
  onPriceTypeChange: (value: PriceType) => void;
  onPriceCurrencyChange: (value: PriceCurrency | undefined) => void;
}

const displayCurrency = (currency: PriceCurrency | undefined, defaultCurrency?: PriceCurrency | null) =>
  currency ?? resolveUserCurrency(defaultCurrency ?? undefined);

export const PriceSection = ({
  priceTotal,
  priceType,
  priceCurrency,
  defaultCurrency,
  onPriceTotalChange,
  onPriceTypeChange,
  onPriceCurrencyChange,
}: PriceSectionProps) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState<string>('');
  const effectiveCurrency = displayCurrency(priceCurrency, defaultCurrency);

  useEffect(() => {
    if (priceTotal !== undefined && priceTotal !== null) {
      setInputValue(priceTotal.toString());
    } else {
      setInputValue('');
    }
  }, [priceTotal]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">{getCurrencySymbol(effectiveCurrency)}</span>
        <h2 className="section-title">
          {t('createGame.price')}
        </h2>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {t('createGame.priceType')}
          </label>
          <Select
            options={[
              { value: 'NOT_KNOWN', label: t('createGame.priceTypeNotKnown') },
              { value: 'FREE', label: t('createGame.priceTypeFree') },
              { value: 'PER_PERSON', label: t('createGame.priceTypePerPerson') },
              { value: 'PER_TEAM', label: t('createGame.priceTypePerTeam') },
              { value: 'TOTAL', label: t('createGame.priceTypeTotal') },
            ]}
            value={priceType}
            onChange={(value) => onPriceTypeChange(value as PriceType)}
            disabled={false}
          />
        </div>
        {priceType !== 'NOT_KNOWN' && priceType !== 'FREE' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                {t('createGame.priceTotal')}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={inputValue}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const filteredValue = rawValue.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
                  setInputValue(filteredValue);
                  if (filteredValue === '' || filteredValue === '.') {
                    onPriceTotalChange(undefined);
                  } else {
                    const numValue = parseFloat(filteredValue);
                    if (!isNaN(numValue)) {
                      onPriceTotalChange(numValue);
                    }
                  }
                }}
                placeholder={t('createGame.priceTotalPlaceholder')}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                {t('createGame.priceCurrency')}
              </label>
              <Select
                options={getCurrencyOptions()}
                value={effectiveCurrency}
                onChange={(value) => onPriceCurrencyChange(value as PriceCurrency)}
                disabled={false}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
