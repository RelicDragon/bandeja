import { describe, expect, it } from 'vitest';
import { applySystemThemeOnForeground } from './applySystemThemeOnForeground';
import type { ResolvedTheme } from './applySystemThemeOnForeground';

describe('applySystemThemeOnForeground', () => {
  it('re-applies OS dark when preference is system and UI is still light', () => {
    expect(
      applySystemThemeOnForeground({
        preference: 'system',
        systemScheme: 'dark',
        appliedTheme: 'light',
      }),
    ).toEqual({ shouldWrite: true, resolved: 'dark' });
  });

  it('re-applies OS light when preference is system and UI is still dark', () => {
    expect(
      applySystemThemeOnForeground({
        preference: 'system',
        systemScheme: 'light',
        appliedTheme: 'dark',
      }),
    ).toEqual({ shouldWrite: true, resolved: 'light' });
  });

  it('ignores OS scheme when preference is explicit light', () => {
    expect(
      applySystemThemeOnForeground({
        preference: 'light',
        systemScheme: 'dark',
        appliedTheme: 'light',
      }),
    ).toEqual({ shouldWrite: false, resolved: 'light' });
  });

  it('ignores OS scheme when preference is explicit dark', () => {
    expect(
      applySystemThemeOnForeground({
        preference: 'dark',
        systemScheme: 'light',
        appliedTheme: 'dark',
      }),
    ).toEqual({ shouldWrite: false, resolved: 'dark' });
  });

  it('is idempotent when system scheme already matches the applied theme', () => {
    expect(
      applySystemThemeOnForeground({
        preference: 'system',
        systemScheme: 'dark',
        appliedTheme: 'dark',
      }),
    ).toEqual({ shouldWrite: false, resolved: 'dark' });
  });

  it('does not oscillate across repeated resume with the same OS scheme', () => {
    let applied: ResolvedTheme = 'light';
    const first = applySystemThemeOnForeground({
      preference: 'system',
      systemScheme: 'dark',
      appliedTheme: applied,
    });
    expect(first.shouldWrite).toBe(true);
    applied = first.resolved;

    const second = applySystemThemeOnForeground({
      preference: 'system',
      systemScheme: 'dark',
      appliedTheme: applied,
    });
    expect(second).toEqual({ shouldWrite: false, resolved: 'dark' });

    const third = applySystemThemeOnForeground({
      preference: 'system',
      systemScheme: 'dark',
      appliedTheme: applied,
    });
    expect(third).toEqual({ shouldWrite: false, resolved: 'dark' });
  });
});
