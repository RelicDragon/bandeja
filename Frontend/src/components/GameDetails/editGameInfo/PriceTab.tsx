import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PriceType, PriceCurrency } from '@/types';
import { Select } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';
import { CurrencySelectorModal } from '@/components/CurrencySelectorModal';
import { ChevronDown } from 'lucide-react';

export interface PriceTabState {
  priceType: PriceType;
  priceTotal: number | null | undefined;
  priceCurrency: PriceCurrency | undefined;
  inputValue: string;
}

interface PriceTabProps {
  state: PriceTabState;
  onChange: (patch: Partial<PriceTabState>) => void;
}

export const PriceTab = ({ state, onChange }: PriceTabProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);

  const handlePriceTypeChange = (value: string) => {
    const pt = value as PriceType;
    if (pt === 'NOT_KNOWN' || pt === 'FREE') {
      onChange({ priceType: pt, priceTotal: undefined, priceCurrency: undefined, inputValue: '' });
    } else {
      onChange({ priceType: pt });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('createGame.priceType')}</label>
        <Select
          options={[
            { value: 'NOT_KNOWN', label: t('createGame.priceTypeNotKnown') },
            { value: 'FREE', label: t('createGame.priceTypeFree') },
            { value: 'PER_PERSON', label: t('createGame.priceTypePerPerson') },
            { value: 'PER_TEAM', label: t('createGame.priceTypePerTeam') },
            { value: 'TOTAL', label: t('createGame.priceTypeTotal') },
          ]}
          value={state.priceType}
          onChange={handlePriceTypeChange}
          disabled={false}
        />
      </div>

      {state.priceType !== 'NOT_KNOWN' && state.priceType !== 'FREE' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('createGame.priceTotal')}</label>
            <input
              type="text"
              inputMode="decimal"
              value={state.inputValue}
              onChange={(e) => {
                const rawValue = e.target.value;
                const filteredValue = rawValue.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
                const priceTotal =
                  filteredValue === '' || filteredValue === '.' ? undefined : parseFloat(filteredValue);
                onChange({
                  inputValue: filteredValue,
                  priceTotal: priceTotal !== undefined && !isNaN(priceTotal) ? priceTotal : undefined,
                });
              }}
              placeholder={t('createGame.priceTotalPlaceholder')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('createGame.priceCurrency')}</label>
            <button
              type="button"
              onClick={() => setCurrencyModalOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <span>{state.priceCurrency ?? resolveUserCurrency(user?.defaultCurrency)}</span>
              <ChevronDown size={16} className="text-gray-500" />
            </button>
            <CurrencySelectorModal
              open={currencyModalOpen}
              onClose={() => setCurrencyModalOpen(false)}
              selected={state.priceCurrency ?? resolveUserCurrency(user?.defaultCurrency)}
              onSelect={(c) => onChange({ priceCurrency: c })}
              title={t('createGame.priceCurrency')}
            />
          </div>
        </>
      )}
    </div>
  );
};
