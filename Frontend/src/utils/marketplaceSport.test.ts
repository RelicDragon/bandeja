import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { MarketItemCategory, User } from '@/types';
import {
  filterCategoriesForListing,
  formatCategoryChipLabel,
  getMarketplaceCategorySport,
  shouldShowCategorySportLabel,
} from './marketplaceSport';

const t = vi.fn((key: string, opts?: { name?: string; sport?: string; defaultValue?: string }) => {
  if (key === 'marketplace.categoryWithSport' && opts?.name && opts?.sport) {
    return `${opts.name} · ${opts.sport}`;
  }
  if (key === 'sport.tennis') return 'Tennis';
  if (key === 'sport.padel') return 'Padel';
  return opts?.defaultValue ?? key;
}) as unknown as TFunction;

const padelOnly = { primarySport: 'PADEL', sportsEnabled: ['PADEL'] } as User;
const multiSport = { primarySport: 'PADEL', sportsEnabled: ['PADEL', 'TENNIS'] } as User;

describe('marketplaceSport', () => {
  it('defaults marketplace sport to primary or padel', () => {
    expect(getMarketplaceCategorySport(null)).toBe('PADEL');
    expect(getMarketplaceCategorySport({ primarySport: 'TENNIS' } as User)).toBe('TENNIS');
  });

  it('filters categories by sport while keeping selected id', () => {
    const categories: MarketItemCategory[] = [
      { id: '1', name: 'Generic' },
      { id: '2', name: 'Padel gear', sport: 'PADEL' },
      { id: '3', name: 'Tennis gear', sport: 'TENNIS' },
    ];
    expect(filterCategoriesForListing(categories, 'PADEL').map((c) => c.id)).toEqual(['1', '2']);
    expect(filterCategoriesForListing(categories, 'PADEL', '3').map((c) => c.id)).toEqual(['1', '2', '3']);
  });

  it('keeps padel-only chip labels quiet', () => {
    const category = { id: '1', name: 'Rackets' } as MarketItemCategory;
    expect(shouldShowCategorySportLabel(padelOnly, category)).toBe(false);
    expect(formatCategoryChipLabel(category, padelOnly, 'PADEL', t)).toBe('Rackets');
  });

  it('shows sport suffix for multi-sport or explicit category sport', () => {
    const generic = { id: '1', name: 'Balls' } as MarketItemCategory;
    expect(formatCategoryChipLabel(generic, multiSport, 'PADEL', t)).toBe('Balls · Padel');

    const tennis = { id: '2', name: 'Strings', sport: 'TENNIS' as const };
    expect(shouldShowCategorySportLabel(padelOnly, tennis)).toBe(true);
    expect(formatCategoryChipLabel(tennis, padelOnly, 'PADEL', t)).toBe('Strings · Tennis');
  });
});
