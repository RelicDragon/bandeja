import type { TFunction } from 'i18next';
import type { MarketItemCategory, Sport, User } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { getUserPrimarySport, hasMultipleSportsEnabled } from '@/utils/profileSports';

export function getMarketplaceCategorySport(user: User | null | undefined): Sport {
  return getUserPrimarySport(user);
}

export function shouldShowCategorySportLabel(
  user: User | null | undefined,
  category: Pick<MarketItemCategory, 'sport'>,
): boolean {
  return hasMultipleSportsEnabled(user) || !!category.sport;
}

export function sportForCategoryChipLabel(
  category: Pick<MarketItemCategory, 'sport'>,
  primarySport: Sport,
  user: User | null | undefined,
): Sport | undefined {
  if (category.sport) return category.sport;
  if (hasMultipleSportsEnabled(user)) return primarySport;
  return undefined;
}

export function formatCategoryChipLabel(
  category: MarketItemCategory,
  user: User | null | undefined,
  primarySport: Sport,
  t: TFunction,
): string {
  if (!shouldShowCategorySportLabel(user, category)) return category.name;
  const sport = sportForCategoryChipLabel(category, primarySport, user);
  if (!sport) return category.name;
  return t('marketplace.categoryWithSport', {
    name: category.name,
    sport: t(getSportConfig(sport).labelKey),
    defaultValue: '{{name}} · {{sport}}',
  });
}

export function filterCategoriesForListing(
  categories: MarketItemCategory[],
  sport: Sport,
  selectedCategoryId?: string,
): MarketItemCategory[] {
  return categories.filter(
    (c) => !c.sport || c.sport === sport || c.id === selectedCategoryId,
  );
}

export function toCategorySelectorItems(
  categories: MarketItemCategory[],
  user: User | null | undefined,
  primarySport: Sport,
  t: TFunction,
): Array<{ id: string; name: string }> {
  return categories.map((c) => ({
    id: c.id,
    name: formatCategoryChipLabel(c, user, primarySport, t),
  }));
}
