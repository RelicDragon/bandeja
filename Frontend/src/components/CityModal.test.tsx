// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const drawerProps = vi.hoisted(() => ({
  handleOnly: undefined as boolean | undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@/api', () => ({
  usersApi: { switchCity: vi.fn() },
}));

vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({
    handleOnly,
    children,
  }: {
    handleOnly?: boolean;
    children: React.ReactNode;
  }) => {
    drawerProps.handleOnly = handleOnly;
    return <div data-testid="city-drawer">{children}</div>;
  },
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHandle: () => <div data-testid="city-drawer-handle" />,
  DrawerCloseButton: () => <button type="button">close</button>,
}));

vi.mock('@/hooks/useBackButtonModal', () => ({
  useBackButtonModal: () => {},
}));

vi.mock('@/hooks/useCityList', () => ({
  useCityList: () => ({
    view: 'country',
    search: '',
    setSearch: () => {},
    loading: false,
    error: '',
    setError: () => {},
    filteredCountries: [],
    filteredCitiesForCountry: [],
    cities: [],
    selectedCountry: null,
    selectCountry: () => {},
    backToCountries: () => {},
  }),
}));

vi.mock('@/components/CityListContent', () => ({
  CityListContent: () => <div data-testid="city-list">list</div>,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: null; updateUser: () => void }) => unknown) =>
    selector({ user: null, updateUser: () => {} }),
}));

import { CityModal } from './CityModal';

describe('CityModal', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    drawerProps.handleOnly = undefined;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('only allows drag-dismiss from the handle so list/map swipe does not close', () => {
    act(() => {
      root.render(<CityModal isOpen onClose={() => {}} onSelect={() => {}} />);
    });
    expect(drawerProps.handleOnly).toBe(true);
    expect(container.querySelector('[data-testid="city-drawer-handle"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="city-list"]')).not.toBeNull();
  });
});
