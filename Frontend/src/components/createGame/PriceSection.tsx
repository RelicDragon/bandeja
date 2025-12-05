import { useTranslation } from 'react-i18next';
import { EntityType, PriceType, PriceCurrency } from '@/types';
import { Select } from '@/components';

interface PriceSectionProps {
  priceTotal: number | undefined;
  priceType: PriceType;
  priceCurrency: PriceCurrency | undefined;
  onPriceTotalChange: (value: number | undefined) => void;
  onPriceTypeChange: (value: PriceType) => void;
  onPriceCurrencyChange: (value: PriceCurrency | undefined) => void;
  entityType: EntityType;
}

export const PriceSection = ({
  priceTotal,
  priceType,
  priceCurrency,
  onPriceTotalChange,
  onPriceTypeChange,
  onPriceCurrencyChange,
  entityType,
}: PriceSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg font-semibold text-gray-500 dark:text-gray-400">€</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
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
              { value: 'PER_PERSON', label: t('createGame.priceTypePerPerson') },
              { value: 'PER_TEAM', label: t('createGame.priceTypePerTeam') },
              { value: 'TOTAL', label: t('createGame.priceTypeTotal') },
            ]}
            value={priceType}
            onChange={(value) => onPriceTypeChange(value as PriceType)}
            disabled={false}
          />
        </div>
        {priceType !== 'NOT_KNOWN' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                {t('createGame.priceTotal')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={priceTotal || ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                  onPriceTotalChange(value);
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
                options={[
                  { value: 'EUR', label: 'EUR' },
                  { value: 'RSD', label: 'RSD' },
                  { value: 'RUB', label: 'RUB' },
                ]}
                value={priceCurrency || 'EUR'}
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
