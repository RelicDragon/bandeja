import { describe, expect, it } from 'vitest';
import { eventHeroSlides } from './eventHeroSlides';

describe('eventHeroSlides', () => {
  it('orders heroes by sortOrder and ignores avatar', () => {
    const slides = eventHeroSlides({
      eventHeroes: [
        { id: 'b', originalUrl: 'b.jpg', thumbnailUrl: 'bt.jpg', sortOrder: 2 },
        { id: 'a', originalUrl: 'a.jpg', thumbnailUrl: 'at.jpg', sortOrder: 0 },
      ],
    });
    expect(slides.map((s) => s.id)).toEqual(['a', 'b']);
    expect(slides[0]?.originalUrl).toBe('a.jpg');
  });

  it('does not fall back to circular avatar', () => {
    expect(eventHeroSlides({})).toEqual([]);
    expect(eventHeroSlides({ eventHeroes: [] })).toEqual([]);
  });
});
