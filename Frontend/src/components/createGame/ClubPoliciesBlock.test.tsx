// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Club } from '@/types';
import { ClubPoliciesBlock } from '@/components/createGame/ClubPoliciesBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const nspadelClub = {
  id: 'club-ns',
  name: 'NS PADEL CENTAR Novi Sad',
  integrationType: 'NSPADELSUPABASE',
  integrationConfig: { supabaseUrl: 'https://xyzcompany.supabase.co' },
} as unknown as Club;

const plainClub = {
  id: 'club-plain',
  name: 'Plain Club',
} as unknown as Club;

describe('ClubPoliciesBlock nspadel notice', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderBlock(club: Club | undefined) {
    act(() => {
      root.render(<ClubPoliciesBlock club={club} entityType="GAME" />);
    });
    return container.textContent ?? '';
  }

  it('shows the profile-booking notice for NS Padel even without policy text', () => {
    expect(renderBlock(nspadelClub)).toContain('createGame.nspadelProfileBookingNotice');
  });

  it('hides the notice for other clubs', () => {
    expect(renderBlock(plainClub)).toBe('');
    expect(
      renderBlock({ ...plainClub, policyText: 'Some policy' } as Club),
    ).not.toContain('createGame.nspadelProfileBookingNotice');
  });
});
