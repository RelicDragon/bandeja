import { describe, expect, it } from 'vitest';
import tailwindConfig from './tailwind.config.js';

describe('tailwind primary palette', () => {
  it('includes 950 so dark:bg-primary-950 utilities are generated', () => {
    const primary = tailwindConfig.theme.extend.colors.primary;
    expect(primary['950']).toBe('#082f49');
  });
});
