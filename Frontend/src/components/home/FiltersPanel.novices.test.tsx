/**
 * @vitest-environment jsdom
 *
 * PRD 360 — the "Novices welcome only" switch in the advanced Filters panel.
 *
 * It is grouped with the other "can I join this" switches, it is off by
 * default, and flipping it reports the change up to the Find filter state —
 * which is what turns into the `noviceOnly=1` SQL param.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/api/clubs', () => ({
  clubsApi: { getByCityId: vi.fn(async () => ({ data: [] })) },
}));

vi.mock('@/api/favorites', () => ({
  favoritesApi: { getUserFavoriteClubIds: vi.fn(async () => []) },
}));

vi.mock('@/components', () => ({
  ToggleSwitch: ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <button
      type="button"
      data-toggle={checked ? 'on' : 'off'}
      onClick={() => onChange(!checked)}
    />
  ),
  RangeSlider: () => null,
}));

vi.mock('@/components/TimeRangeSlider', () => ({ TimeRangeSlider: () => null }));
vi.mock('@/components/ClubBookingBadge', () => ({ ClubBookingBadge: () => null }));
vi.mock('@/components/home/ClubPageChevron', () => ({ ClubPageChevron: () => null }));

const { FiltersPanel } = await import('./FiltersPanel');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

type PanelProps = React.ComponentProps<typeof FiltersPanel>;

function render(overrides: Partial<PanelProps> = {}) {
  const onFilterNoviceFriendlyChange = vi.fn();
  const props: PanelProps = {
    filterAvailableSlots: false,
    onFilterAvailableSlotsChange: vi.fn(),
    filterSuitableRating: false,
    onFilterSuitableRatingChange: vi.fn(),
    filterNoviceFriendly: false,
    onFilterNoviceFriendlyChange,
    hideBarGames: false,
    onHideBarGamesChange: vi.fn(),
    filterSport: 'primary',
    viewerPrimarySport: 'PADEL',
    clubIds: [],
    onClubIdsChange: vi.fn(),
    timeRange: ['00:00', '24:00'],
    onTimeRangeChange: vi.fn(),
    playerLevelRange: [1, 7],
    onPlayerLevelRangeChange: vi.fn(),
    hour12: false,
    ...overrides,
  };
  act(() => {
    root.render(<FiltersPanel {...props} />);
  });
  return { onFilterNoviceFriendlyChange };
}

function rowFor(label: string): HTMLElement | undefined {
  return [...container.querySelectorAll('span')]
    .find((el) => el.textContent === label)
    ?.closest('div.flex.items-center.justify-between') as HTMLElement | undefined;
}

describe('FiltersPanel — novices welcome only', () => {
  it('renders the switch with its hint, off by default', () => {
    render();
    const row = rowFor('games.filterNoviceOnly');
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain('games.filterNoviceOnlyHint');
    expect(row!.querySelector('button')?.getAttribute('data-toggle')).toBe('off');
  });

  it('sits with the other join-eligibility switches, above the club chips', () => {
    render();
    const slots = rowFor('games.haveAvailableSlots')!;
    const novices = rowFor('games.filterNoviceOnly')!;
    expect(
      slots.compareDocumentPosition(novices) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('reports the change up rather than holding local state', () => {
    const { onFilterNoviceFriendlyChange } = render();
    act(() => {
      rowFor('games.filterNoviceOnly')!.querySelector('button')!.click();
    });
    expect(onFilterNoviceFriendlyChange).toHaveBeenCalledWith(true);
  });

  it('shows the stored value when it is already on', () => {
    render({ filterNoviceFriendly: true });
    expect(
      rowFor('games.filterNoviceOnly')!.querySelector('button')?.getAttribute('data-toggle'),
    ).toBe('on');
  });
});
