import { describe, expect, it } from 'vitest';
import {
  referralCodeErrorKey,
  validateReferralCodeInput,
} from './referralCodeValidation';
import { referralChipSpec, referralInviteInitials, referralInviteName } from './referralInviteChip';
import { walletTransactionLabelKey, REFERRAL_TRANSACTION_REASON } from './walletReferralRow';

describe('validateReferralCodeInput', () => {
  it('says nothing while the user is still typing', () => {
    expect(validateReferralCodeInput('')).toEqual({ status: 'empty', code: null });
    expect(validateReferralCodeInput('   ')).toEqual({ status: 'empty', code: null });
    expect(validateReferralCodeInput('B')).toEqual({ status: 'incomplete', code: null });
    expect(validateReferralCodeInput('BNDJ-7K')).toEqual({ status: 'incomplete', code: null });
  });

  it('accepts a complete code in any form', () => {
    expect(validateReferralCodeInput('BNDJ-7K2Q')).toEqual({ status: 'ready', code: 'BNDJ7K2Q' });
    expect(validateReferralCodeInput('bndj7k2q')).toEqual({ status: 'ready', code: 'BNDJ7K2Q' });
  });

  it('rejects a full-length code that cannot exist', () => {
    // Eight characters, one of them out of the alphabet: this is a real typo,
    // not a half-typed code, so it gets an error immediately.
    expect(validateReferralCodeInput('BNDJ-7K2O')).toEqual({ status: 'invalid', code: null });
    expect(validateReferralCodeInput('BNDJ7K2QQ')).toEqual({ status: 'invalid', code: null });
  });

  it('catches the viewer using their own code without a round trip', () => {
    expect(validateReferralCodeInput('BNDJ-7K2Q', 'BNDJ7K2Q')).toEqual({
      status: 'self',
      code: 'BNDJ7K2Q',
    });
    expect(validateReferralCodeInput('BNDJ-7K2Q', 'AAAA-2222').status).toBe('ready');
    expect(validateReferralCodeInput('BNDJ-7K2Q', null).status).toBe('ready');
  });

  it('maps only the actionable statuses to an error message', () => {
    expect(referralCodeErrorKey('empty')).toBeNull();
    expect(referralCodeErrorKey('incomplete')).toBeNull();
    expect(referralCodeErrorKey('ready')).toBeNull();
    expect(referralCodeErrorKey('invalid')).toBe('referral.errors.invalidCode');
    expect(referralCodeErrorKey('self')).toBe('referral.errors.selfCode');
  });
});

describe('referralChipSpec', () => {
  it('gives each state a distinct labelled chip', () => {
    expect(referralChipSpec('INVITED', null).labelKey).toBe('referral.chipInvited');
    expect(referralChipSpec('JOINED', null).labelKey).toBe('referral.chipJoined');
    expect(referralChipSpec('PLAYED', 50).labelKey).toBe('referral.chipPlayed');
    const classes = (['INVITED', 'JOINED', 'PLAYED'] as const).map(
      (state) => referralChipSpec(state, null).className,
    );
    expect(new Set(classes).size).toBe(3);
  });

  it('only shows coins on a rewarded invite', () => {
    expect(referralChipSpec('PLAYED', 50).coins).toBe(50);
    // Joined but unpaid must not imply coins have landed.
    expect(referralChipSpec('JOINED', 50).coins).toBeNull();
    expect(referralChipSpec('INVITED', 50).coins).toBeNull();
    expect(referralChipSpec('PLAYED', null).coins).toBeNull();
    expect(referralChipSpec('PLAYED', 0).coins).toBeNull();
  });
});

describe('referral invite identity', () => {
  it('falls back to "Pending" for an invite that never converted', () => {
    expect(referralInviteName(null)).toBeNull();
    expect(referralInviteInitials(null)).toBe('');
  });

  it('builds a name and initials from whatever the account has', () => {
    expect(referralInviteName({ firstName: 'Ana', lastName: 'Ilic' })).toBe('Ana Ilic');
    expect(referralInviteName({ firstName: 'Ana', lastName: null })).toBe('Ana');
    expect(referralInviteName({ firstName: null, lastName: null })).toBeNull();
    expect(referralInviteInitials({ firstName: 'ana', lastName: 'ilic' })).toBe('AI');
    expect(referralInviteInitials({ firstName: 'Ana', lastName: null })).toBe('A');
  });
});

describe('walletTransactionLabelKey', () => {
  it('localizes the machine reason a payout row stores', () => {
    expect(walletTransactionLabelKey(REFERRAL_TRANSACTION_REASON)).toBe('referral.walletRowLabel');
  });

  it('leaves ordinary free-text row names alone', () => {
    expect(walletTransactionLabelKey('Admin coin drop')).toBeNull();
    expect(walletTransactionLabelKey('Transfer')).toBeNull();
    expect(walletTransactionLabelKey(undefined)).toBeNull();
    expect(walletTransactionLabelKey('')).toBeNull();
  });
});
