import type { RefObject } from 'react';
import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EntityType, PriceCurrency, PriceType } from '@/types';
import { PriceSection } from './PriceSection';

interface GameNameCommentsSectionProps {
  comments: string;
  onCommentsChange: (comments: string) => void;
  entityType: EntityType;
  priceTotal: number | undefined;
  priceType: PriceType;
  priceCurrency: PriceCurrency | undefined;
  defaultCurrency?: PriceCurrency | null;
  onPriceTotalChange: (value: number | undefined) => void;
  onPriceTypeChange: (value: PriceType) => void;
  onPriceCurrencyChange: (value: PriceCurrency | undefined) => void;
  priceSectionRef?: RefObject<HTMLDivElement | null>;
}

export const GameNameCommentsSection = ({
  comments,
  onCommentsChange,
  entityType,
  priceTotal,
  priceType,
  priceCurrency,
  defaultCurrency,
  onPriceTotalChange,
  onPriceTypeChange,
  onPriceCurrencyChange,
  priceSectionRef,
}: GameNameCommentsSectionProps) => {
  const { t } = useTranslation();

  const descriptionLabel = t('createGame.description');
  const descriptionPlaceholder =
    entityType === 'TOURNAMENT'
      ? t('createGame.descriptionPlaceholderTournament')
      : entityType === 'LEAGUE'
        ? t('createGame.descriptionPlaceholderLeague')
        : entityType === 'TRAINING'
          ? t('createGame.descriptionPlaceholderTraining')
          : t('createGame.descriptionPlaceholder');

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">{t('createGame.miscellaneous')}</h2>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            {descriptionLabel}
          </label>
          <textarea
            value={comments}
            onChange={(e) => onCommentsChange(e.target.value)}
            placeholder={descriptionPlaceholder}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
            rows={3}
          />
        </div>
        <div ref={priceSectionRef}>
          <PriceSection
            embedded
            priceTotal={priceTotal}
            priceType={priceType}
            priceCurrency={priceCurrency}
            defaultCurrency={defaultCurrency}
            onPriceTotalChange={onPriceTotalChange}
            onPriceTypeChange={onPriceTypeChange}
            onPriceCurrencyChange={onPriceCurrencyChange}
          />
        </div>
      </div>
    </div>
  );
};
