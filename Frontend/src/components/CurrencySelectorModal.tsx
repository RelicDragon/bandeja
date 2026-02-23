import { useTranslation } from 'react-i18next';
import type { PriceCurrency } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { SUPPORTED_CURRENCIES, CURRENCY_INFO, getCurrencyName } from '@/utils/currency';

interface CurrencySelectorModalProps {
  open: boolean;
  onClose: () => void;
  selected: PriceCurrency;
  onSelect: (currency: PriceCurrency) => void;
  title?: string;
}

export const CurrencySelectorModal = ({
  open,
  onClose,
  selected,
  onSelect,
  title,
}: CurrencySelectorModalProps) => {
  const { t } = useTranslation();
  const modalTitle = title ?? t('createGame.priceCurrency', { defaultValue: 'Currency' });
  const handleSelect = (code: PriceCurrency) => {
    onSelect(code);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} modalId="currency-selector-modal">
      <DialogContent className="max-w-[90vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh] p-4">
          <div className="grid grid-cols-5 gap-1.5">
            {SUPPORTED_CURRENCIES.map((code) => {
              const info = CURRENCY_INFO[code];
              const isSelected = code === selected;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleSelect(code)}
                  className={`
                    flex flex-col items-center justify-center aspect-square w-full min-w-0 py-1.5 px-1 rounded-md border-2 transition-colors
                    ${isSelected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }
                  `}
                >
                  <span className="font-semibold text-xs leading-tight">{code}</span>
                  <span className="text-[10px] mt-0.5 opacity-90 leading-tight">{info.symbol}</span>
                </button>
              );
            })}
          </div>
        </div>
        {selected && (
          <div className="px-4 pb-4 pt-0 text-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
            {getCurrencyName(selected)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
