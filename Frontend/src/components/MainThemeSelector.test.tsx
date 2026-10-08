// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MEMBER_THEME_IDS } from '@/utils/mainTheme';
import { MainThemeSelector } from './MainThemeSelector';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it('offers Classic plus every member theme as one radio group with a themed preview each', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() => root.render(<MainThemeSelector value="ocean" onChange={onChange} />));
  const radios = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(radios.map((r) => r.value).sort()).toEqual(['classic', ...MEMBER_THEME_IDS].sort());
  expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  expect(radios.find((r) => r.checked)?.value).toBe('ocean');
  for (const id of MEMBER_THEME_IDS) expect(host.querySelector(`.main-theme-phone[data-member-theme="${id}"]`)).not.toBeNull();
  expect(host.querySelector('.main-theme-phone--classic')?.hasAttribute('data-member-theme')).toBe(false);
  act(() => radios.find((r) => r.value === 'nordic')!.click());
  expect(onChange).toHaveBeenCalledWith('nordic');
  act(() => root.unmount());
});
