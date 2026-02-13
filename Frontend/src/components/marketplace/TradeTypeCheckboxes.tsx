import { MarketItemTradeType } from '@/types';

const BTN_BASE =
  'inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20';

const SELECTED_STYLES: Record<string, string> = {
  BUY_IT_NOW: 'bg-emerald-500 text-white border-emerald-500',
  SUGGESTED_PRICE: 'bg-amber-500 text-white border-amber-500',
  AUCTION: 'bg-violet-500 text-white border-violet-500',
  FREE: 'bg-blue-500 text-white border-blue-500',
};

const UNSELECTED = 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-800 dark:text-white hover:border-primary-500/50';

interface TradeTypeCheckboxesProps {
  value: MarketItemTradeType[];
  onChange: (v: MarketItemTradeType[]) => void;
  options: Array<{ value: MarketItemTradeType; label: string }>;
}

export const TradeTypeCheckboxes = ({ value, onChange, options }: TradeTypeCheckboxesProps) => {
  const select = (v: MarketItemTradeType) => {
    onChange([v]);
  };

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {options.map((opt) => {
        const isSelected = value.includes(opt.value);
        const selectedStyle = SELECTED_STYLES[opt.value] ?? SELECTED_STYLES.BUY_IT_NOW;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => select(opt.value)}
            className={BTN_BASE + (isSelected ? ` ${selectedStyle}` : ` ${UNSELECTED}`)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
