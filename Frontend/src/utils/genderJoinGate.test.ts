import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenderJoinGateStore } from '@/store/genderJoinGateStore';

const auth = { genderIsSet: false as boolean | undefined };

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'u1', genderIsSet: auth.genderIsSet } }),
  },
}));

import {
  genderAddBlockReason,
  GENDER_UNSET_CODE,
  GENDER_UNSET_OTHER_MESSAGE,
  isSelfGenderUnsetError,
  needsGenderForEvent,
  recoverGenderUnsetJoin,
  runWithGenderForEvent,
} from './genderJoinGate';

describe('genderJoinGate', () => {
  beforeEach(() => {
    auth.genderIsSet = false;
    useGenderJoinGateStore.setState({ isOpen: false, pendingRun: null });
  });

  it('needs gender only for unset users on gendered events', () => {
    expect(needsGenderForEvent({ genderTeams: 'MEN' }, { genderIsSet: false })).toBe(true);
    expect(needsGenderForEvent({ genderTeams: 'MEN' }, { genderIsSet: true })).toBe(false);
    expect(needsGenderForEvent({ genderTeams: 'ANY' }, { genderIsSet: false })).toBe(false);
  });

  it('does not send join until gender is set', () => {
    const action = vi.fn();
    expect(runWithGenderForEvent({ genderTeams: 'WOMEN' }, action)).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(useGenderJoinGateStore.getState().isOpen).toBe(true);

    const pending = useGenderJoinGateStore.getState().resolveSaved();
    auth.genderIsSet = true;
    expect(runWithGenderForEvent({ genderTeams: 'WOMEN' }, action)).toBe(true);
    expect(action).not.toHaveBeenCalled();
    void pending?.();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('skips the sheet when genderIsSet is true', () => {
    auth.genderIsSet = true;
    const action = vi.fn();
    expect(runWithGenderForEvent({ genderTeams: 'MEN' }, action)).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(useGenderJoinGateStore.getState().isOpen).toBe(false);
  });

  it('does not send join if the sheet is cancelled', () => {
    const action = vi.fn();
    expect(runWithGenderForEvent({ genderTeams: 'MEN' }, action)).toBe(false);
    useGenderJoinGateStore.getState().dismiss();
    expect(useGenderJoinGateStore.getState().isOpen).toBe(false);
    expect(useGenderJoinGateStore.getState().pendingRun).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it('blocks organizer add of an unset user', () => {
    expect(genderAddBlockReason({ genderTeams: 'MEN' }, { genderIsSet: false })).toBe('genderUnset');
    expect(genderAddBlockReason({ genderTeams: 'MEN' }, { genderIsSet: true })).toBeNull();
    expect(genderAddBlockReason({ genderTeams: 'ANY' }, { genderIsSet: false })).toBeNull();
    expect(genderAddBlockReason({ genderTeams: 'MIX_PAIRS' }, {})).toBe('genderUnset');
    expect(genderAddBlockReason({ genderTeams: 'WOMEN' }, undefined)).toBe('genderUnset');
  });

  it('reopens the sheet for a slipped-through unset error, not other-user copy', () => {
    const retry = vi.fn();
    expect(
      recoverGenderUnsetJoin(
        { response: { data: { code: GENDER_UNSET_CODE, message: GENDER_UNSET_CODE } } },
        retry,
      ),
    ).toBe(true);
    expect(useGenderJoinGateStore.getState().isOpen).toBe(true);
    expect(retry).not.toHaveBeenCalled();

    useGenderJoinGateStore.setState({ isOpen: false, pendingRun: null });
    expect(
      recoverGenderUnsetJoin(
        { response: { data: { code: GENDER_UNSET_CODE, message: GENDER_UNSET_OTHER_MESSAGE } } },
        retry,
      ),
    ).toBe(false);
    expect(isSelfGenderUnsetError({
      response: { data: { message: GENDER_UNSET_OTHER_MESSAGE } },
    })).toBe(false);
  });
});
