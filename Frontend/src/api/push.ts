import type { AxiosRequestConfig } from 'axios';
import api from './axios';

export const pushApi = {
  removeAllTokens: () =>
    api.delete('/push/tokens', { skipAuth401Handler: true } as AxiosRequestConfig & { skipAuth401Handler?: boolean }),
  renewToken: (oldToken: string, newToken: string, appVersion?: string, appBuild?: number) =>
    api.post('/push/tokens/renew', { oldToken, newToken, appVersion, appBuild }),
};
