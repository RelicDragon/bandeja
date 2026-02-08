import { CategorySelector } from './CategorySelector';

interface MarketplaceFiltersProps {
  categoryId: string;
  categories: Array<{ id: string; name: string }>;
  onCategoryChange: (v: string) => void;
  labels: {
    allCategories: string;
  };
}

export const MarketplaceFilters = ({
  categoryId,
  categories,
  onCategoryChange,
  labels,
}: MarketplaceFiltersProps) => {
  return (
    <div className="flex flex-col gap-4">
      <CategorySelector value={categoryId} onChange={onCategoryChange} categories={categories} allLabel={labels.allCategories} />
    </div>
  );
};
