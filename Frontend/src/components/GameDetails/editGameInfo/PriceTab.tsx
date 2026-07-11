import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PriceType, PriceCurrency } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { resolveUserCurrency } from '@/utils/currency';
import { CurrencySelectorModal } from '@/components/CurrencySelectorModal';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { ChevronDown, HelpCircle, Gift, User, Users, Banknote } from 'lucide-react';

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
  const resolvedCurrency = state.priceCurrency ?? resolveUserCurrency(user?.defaultCurrency);

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
        <SegmentedSwitch
          orientation="vertical"
          tabs={[
            { id: 'NOT_KNOWN', label: t('createGame.priceTypeNotKnown'), icon: HelpCircle },
            { id: 'FREE', label: t('createGame.priceTypeFree'), icon: Gift },
            { id: 'PER_PERSON', label: t('createGame.priceTypePerPerson'), icon: User },
            { id: 'PER_TEAM', label: t('createGame.priceTypePerTeam'), icon: Users },
            { id: 'TOTAL', label: t('createGame.priceTypeTotal'), icon: Banknote },
          ]}
          activeId={state.priceType}
          onChange={handlePriceTypeChange}
          showOnlyActiveTabText={false}
          layoutId="edit-game-price-type"
        />
      </div>

      {state.priceType !== 'NOT_KNOWN' && state.priceType !== 'FREE' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{t('createGame.priceTotal')}</label>
          <div className="flex gap-2">
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
              className="min-w-0 flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            <button
              type="button"
              onClick={() => setCurrencyModalOpen(true)}
              aria-label={t('createGame.priceCurrency')}
              className="flex shrink-0 items-center gap-1.5 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span>{resolvedCurrency}</span>
              <ChevronDown size={16} className="text-gray-500" />
            </button>
          </div>
          <CurrencySelectorModal
            open={currencyModalOpen}
            onClose={() => setCurrencyModalOpen(false)}
            selected={resolvedCurrency}
            onSelect={(c) => onChange({ priceCurrency: c })}
            title={t('createGame.priceCurrency')}
          />
        </div>
      )}
    </div>
  );
};
