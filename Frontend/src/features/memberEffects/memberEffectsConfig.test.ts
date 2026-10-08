import { describe, expect, it } from 'vitest';
import { MEMBER_THEME_IDS, activeMemberTheme } from '@/utils/mainTheme';
import {
  CELEBRATION_MAX_MS,
  CELEBRATION_MAX_PARTICLES,
  MEMBER_CELEBRATIONS,
  MEMBER_SPINNERS,
  buildCelebrationParticles,
  celebrationFor,
  spinnerFor,
} from './memberEffectsConfig';

const EXPECTED_SPINNERS = {
  premium: 'goldRing',
  spring: 'swallow',
  summer: 'sunRays',
  alpine: 'alpineSunrise',
  nordic: 'snowflake',
  ocean: 'bubbleRing',
  woodstone: 'woodRing',
  steampunk: 'gear',
  cyberpunk: 'neonDash',
} as const;

const SIGNATURE_SHAPES = {
  premium: ['dust', 'glint'],
  spring: ['petal'],
  summer: ['sunburst', 'droplet'],
  alpine: ['wildflower', 'leaf'],
  nordic: ['snowflake'],
  ocean: ['bubble', 'speck'],
  woodstone: ['mapleLeaf', 'shaving'],
  steampunk: ['cog', 'steam'],
  cyberpunk: ['spark', 'glitch'],
} as const;

describe('member effects mapping', () => {
  it('covers every member theme and nothing else', () => {
    expect(Object.keys(MEMBER_CELEBRATIONS).sort()).toEqual([...MEMBER_THEME_IDS].sort());
    expect(Object.keys(MEMBER_SPINNERS).sort()).toEqual([...MEMBER_THEME_IDS].sort());
  });

  it('maps each theme to its own spinner', () => {
    for (const id of MEMBER_THEME_IDS) expect(spinnerFor(id)).toBe(EXPECTED_SPINNERS[id]);
    expect(new Set(Object.values(MEMBER_SPINNERS)).size).toBe(MEMBER_THEME_IDS.length);
  });

  it('gives each theme its signature particles', () => {
    for (const id of MEMBER_THEME_IDS) {
      const shapes = MEMBER_CELEBRATIONS[id].recipes.map((r) => r.shape);
      for (const s of SIGNATURE_SHAPES[id]) expect(shapes, id).toContain(s);
    }
  });

  it('keeps Classic on the original effects', () => {
    expect(celebrationFor(null)).toBeNull();
    expect(spinnerFor(null)).toBeNull();
    // Non-members and Classic never resolve a member theme, so call sites keep today's effect.
    expect(activeMemberTheme({ isPremium: false, mainTheme: 'ocean' })).toBeNull();
    expect(activeMemberTheme({ isPremium: true, mainTheme: 'classic' })).toBeNull();
    expect(activeMemberTheme({ isPremium: true, mainTheme: 'ocean' })).toBe('ocean');
  });

  it('stays within the particle and duration budget on both surfaces', () => {
    for (const id of MEMBER_THEME_IDS) {
      for (const surface of ['light', 'dark'] as const) {
        const particles = buildCelebrationParticles(MEMBER_CELEBRATIONS[id], surface, 120);
        expect(particles.length, id).toBeGreaterThan(0);
        expect(particles.length, id).toBeLessThanOrEqual(CELEBRATION_MAX_PARTICLES);
        for (const p of particles) {
          expect(p.delayMs).toBeGreaterThanOrEqual(0);
          expect(p.delayMs + p.durationMs, `${id} ${p.shape}`).toBeLessThanOrEqual(CELEBRATION_MAX_MS);
          expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(120);
        }
        const cfg = MEMBER_CELEBRATIONS[id];
        const palette = [
          ...(surface === 'dark' ? cfg.onDark : cfg.onLight),
          ...cfg.recipes.flatMap((r) => (r.colors ? (surface === 'dark' ? r.colors.onDark : r.colors.onLight) : [])),
        ];
        expect(particles.every((p) => palette.includes(p.color))).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    const a = buildCelebrationParticles(MEMBER_CELEBRATIONS.spring, 'light', 100);
    const b = buildCelebrationParticles(MEMBER_CELEBRATIONS.spring, 'light', 100);
    expect(a).toEqual(b);
  });
});
