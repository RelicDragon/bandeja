import type { Game, GameEventHero } from '@/types';

export type EventHeroSlide = {
  id: string;
  originalUrl: string;
  previewUrl: string;
};

export function sortEventHeroes(heroes: GameEventHero[] | undefined): GameEventHero[] {
  return [...(heroes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function eventHeroSlides(game: Pick<Game, 'eventHeroes'>): EventHeroSlide[] {
  return sortEventHeroes(game.eventHeroes).map((hero) => ({
    id: hero.id,
    originalUrl: hero.originalUrl,
    previewUrl: hero.thumbnailUrl || hero.originalUrl,
  }));
}
