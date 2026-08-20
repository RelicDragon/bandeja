import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import {
  BUG_CREATE_ERROR_FALLBACK_KEY,
  BUG_CREATE_NETWORK_ERROR_KEY,
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

  it('maps Axios transport failures to the network i18n key', () => {
    expect(extractBugCreateErrorMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      BUG_CREATE_NETWORK_ERROR_KEY
    );
    expect(
      extractBugCreateErrorMessage(new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED'))
    ).toBe(BUG_CREATE_NETWORK_ERROR_KEY);
  });

  it('does not dump raw HTML response bodies', () => {
    expect(
      extractBugCreateErrorMessage(
        new AxiosError('Request failed', '502', undefined, undefined, {
          status: 502,
          data: '<html>502 Bad Gateway</html>',
          statusText: 'Bad Gateway',
          headers: {},
          config: {} as never,
        })
      )
    ).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
  });

  it('maps Axios HTTP errors without a parseable body to the fallback key', () => {
    expect(
      extractBugCreateErrorMessage(
        new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, {
          status: 500,
          data: null,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as never,
        })
      )
    ).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
  });

  it('surfaces non-Axios Error messages', () => {
    expect(extractBugCreateErrorMessage(new TypeError('Cannot read properties of undefined'))).toBe(
      'Cannot read properties of undefined'
    );
  });

  it('surfaces thrown strings', () => {
    expect(extractBugCreateErrorMessage('something broke')).toBe('something broke');
  });

  it('surfaces plain objects with a message', () => {
    expect(extractBugCreateErrorMessage({ message: 'plain object fail' })).toBe('plain object fail');
  });

  it('uses the first Axios array message', () => {
    expect(
      extractBugCreateErrorMessage(
        new AxiosError('Request failed', '400', undefined, undefined, {
          status: 400,
          data: { message: ['  first  ', 'second'] },
          statusText: '',
          headers: {},
          config: {} as never,
        })
      )
    ).toBe('first');
  });

  it('uses Axios data.error when message is absent', () => {
    expect(
      extractBugCreateErrorMessage(
        new AxiosError('Request failed', '400', undefined, undefined, {
          status: 400,
          data: { error: 'nope' },
          statusText: '',
          headers: {},
          config: {} as never,
        })
      )
    ).toBe('nope');
  });

  it('falls back for empty or unknown values', () => {
    expect(extractBugCreateErrorMessage(null)).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage(undefined)).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage({})).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage(0)).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
    expect(extractBugCreateErrorMessage(new Error('   '))).toBe(BUG_CREATE_ERROR_FALLBACK_KEY);
  });
});
