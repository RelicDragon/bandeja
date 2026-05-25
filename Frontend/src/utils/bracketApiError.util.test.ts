import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import {
  bracketEditErrorMessage,
  bracketNotifySummaryErrorMessage,
  bracketWalkoverErrorMessage,
} from './bracketApiError.util';

const t = (key: string) => key;

function axiosError(status: number, message: string): AxiosError {
  return new AxiosError(message, String(status), undefined, undefined, {
    status,
    data: { message },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

describe('bracketWalkoverErrorMessage', () => {
  it('maps play-in gate conflict', () => {
    expect(
      bracketWalkoverErrorMessage(
        axiosError(409, 'Complete all play-in games before knockout walkover'),
        t
      )
    ).toBe('gameDetails.bracketWalkoverErrorPlayInGate');
  });

  it('maps bye slot rejection', () => {
    expect(
      bracketWalkoverErrorMessage(axiosError(400, 'Cannot assign walkover on a bye slot'), t)
    ).toBe('gameDetails.bracketWalkoverErrorBye');
  });

  it('falls back to generic', () => {
    expect(bracketWalkoverErrorMessage(new Error('network'), t)).toBe(
      'gameDetails.bracketWalkoverErrorGeneric'
    );
  });
});

describe('bracketEditErrorMessage', () => {
  it('maps seeding locked', () => {
    expect(bracketEditErrorMessage(axiosError(409, 'Bracket seeding is locked'), t)).toBe(
      'gameDetails.bracketEditErrorSeedingLocked'
    );
  });

  it('maps forbidden', () => {
    expect(
      bracketEditErrorMessage(axiosError(403, 'Only owners and admins can edit bracket slots'), t)
    ).toBe('gameDetails.bracketEditErrorForbidden');
  });
});

describe('bracketNotifySummaryErrorMessage', () => {
  it('maps champion not ready', () => {
    expect(
      bracketNotifySummaryErrorMessage(axiosError(409, 'Bracket champion is not determined yet'), t)
    ).toBe('gameDetails.bracketNotifySummaryErrorNoChampion');
  });
});
