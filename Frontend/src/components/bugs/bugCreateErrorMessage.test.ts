import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import {
  BUG_CREATE_ERROR_FALLBACK_KEY,
  extractBugCreateErrorMessage,
} from './bugCreateErrorMessage';

function axiosError(message: string, status = 400): AxiosError {
  return new AxiosError(message, String(status), undefined, undefined, {
    status,
    data: { message },
    statusText: '',
    headers: {},
    config: {} as never,
  });
}

describe('extractBugCreateErrorMessage', () => {
  it('uses the Axios response message when present', () => {
    expect(extractBugCreateErrorMessage(axiosError('Server said no'))).toBe('Server said no');
  });

  it('surfaces Axios network errors without a response body', () => {
    expect(extractBugCreateErrorMessage(new AxiosError('Network Error'))).toBe('Network Error');
  });

  it('surfaces non-Axios Error messages', () => {
    expect(extractBugCreateErrorMessage(new TypeError('Cannot read properties of undefined'))).toBe(
      'Cannot read properties of undefined'
    );
  });

  it('surfaces thrown strings', () => {
    expect(extractBugCreateErrorMessage('something broke')).toBe('something broke');
  });

  it('falls back for empty or unknown values', () => {
    expect(extractBugCreateErrorMessage(null)).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage(undefined)).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage({})).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage(new Error('   '))).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
  });
});
