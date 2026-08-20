export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export type ApplySystemThemeOnForegroundInput = {
  preference: ThemePreference;
  systemScheme: ResolvedTheme;
  appliedTheme: ResolvedTheme;
};

export type ApplySystemThemeOnForegroundResult = {
  shouldWrite: boolean;
  resolved: ResolvedTheme;
};

export function applySystemThemeOnForeground(
  input: ApplySystemThemeOnForegroundInput,
): ApplySystemThemeOnForegroundResult {
  const resolved: ResolvedTheme =
    input.preference === 'system' ? input.systemScheme : input.preference;
  return {
    shouldWrite: resolved !== input.appliedTheme,
    resolved,
  };
}
