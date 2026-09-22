// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CreateGameSummaryBar } from './CreateGameSummaryBar';
import { useCreateGameSummaryChips } from './useCreateGameSummaryChips';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { renderIcon, t } = vi.hoisted(() => ({
  renderIcon: vi.fn(),
  t: (key: string) => key,
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t }),
}));
vi.mock('lucide-react', async (importOriginal) => ({
  ...await importOriginal<typeof import('lucide-react')>(),
  Users: () => { renderIcon(); return <svg />; },
}));

const summary: Parameters<typeof useCreateGameSummaryChips>[0] = {
  past: { setup: true }, entityType: 'GAME', showSportChip: false,
  selectedSport: 'PADEL', maxParticipants: 4, playersPerMatch: 4,
  hasFixedTeams: false, genderTeams: 'ANY', showTemplatePicker: false,
  activeTemplateId: null, isCustomFormat: false, clubs: [], selectedClub: '',
  courts: [], selectedCourt: 'notBooked', selectedDate: new Date('2026-09-22T12:00:00Z'),
  selectedTime: '', duration: 90, getDurationLabel: String, playerLevelRange: [1, 7],
  isPublic: true, isRatingGame: true, gameName: '', priceType: 'NOT_KNOWN',
  priceTotal: undefined, priceCurrency: undefined, defaultCurrency: undefined,
};
const onChipClick = vi.fn();

function Harness({ maxParticipants = 4 }: { maxParticipants?: number }) {
  const chips = useCreateGameSummaryChips({ ...summary, maxParticipants });
  return <CreateGameSummaryBar chips={chips} onChipClick={onChipClick} />;
}

const host = document.createElement('div');
const root = createRoot(host);
afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

it('keeps unchanged chips rendered and updates real form edits in place', () => {
  act(() => root.render(<Harness />));
  const chip = host.querySelector('button');
  expect(chip?.textContent).toBe('4');
  renderIcon.mockClear();

  act(() => root.render(<Harness />));
  expect(renderIcon).not.toHaveBeenCalled();
  expect(host.querySelector('button')).toBe(chip);

  act(() => root.render(<Harness maxParticipants={8} />));
  expect(chip?.textContent).toBe('8');
  expect(renderIcon).toHaveBeenCalledTimes(1);
  act(() => chip?.click());
  expect(onChipClick).toHaveBeenCalledWith('setup');
});
