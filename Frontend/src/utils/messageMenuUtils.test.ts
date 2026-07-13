import { describe, expect, it } from 'vitest';
import { getUserDisplayName, hasUserDisplayName, mergeBasicUsers } from './messageMenuUtils';

describe('hasUserDisplayName', () => {
  it('returns false for missing or empty names', () => {
    expect(hasUserDisplayName(undefined)).toBe(false);
    expect(hasUserDisplayName(null)).toBe(false);
    expect(hasUserDisplayName({ firstName: '', lastName: '' })).toBe(false);
  });

  it('returns true when a displayable name exists', () => {
    expect(hasUserDisplayName({ firstName: 'Ada', lastName: 'Lovelace' })).toBe(true);
    expect(hasUserDisplayName({ firstName: 'Ada' })).toBe(true);
  });
});

describe('mergeBasicUsers', () => {
  it('prefers store names over socket stub users', () => {
    const merged = mergeBasicUsers(
      { id: 'u1', firstName: '', lastName: '', avatar: null },
      { id: 'u1', firstName: 'Artem', lastName: 'Fedorov', avatar: '/a.png' }
    );

    expect(getUserDisplayName(merged!)).toBe('Artem Fedorov');
    expect(merged?.avatar).toBe('/a.png');
  });

  it('keeps embedded avatar when store has none', () => {
    const merged = mergeBasicUsers(
      { id: 'u1', firstName: '', lastName: '', avatar: '/from-message.png' },
      { id: 'u1', firstName: 'Artem', lastName: 'Fedorov', avatar: null }
    );

    expect(merged?.avatar).toBe('/from-message.png');
    expect(getUserDisplayName(merged!)).toBe('Artem Fedorov');
  });

  it('returns whichever side is available', () => {
    expect(mergeBasicUsers(undefined, { id: 'u1', firstName: 'A', lastName: 'B' })?.firstName).toBe('A');
    expect(mergeBasicUsers({ id: 'u1', firstName: 'A', lastName: 'B' }, undefined)?.firstName).toBe('A');
  });
});
