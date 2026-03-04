import api from './axios';

export const pushApi = {
  removeAllTokens: () => api.delete('/push/tokens'),
  renewToken: (oldToken: string, newToken: string, appVersion?: string, appBuild?: number) =>
    api.post('/push/tokens/renew', { oldToken, newToken, appVersion, appBuild }),
};
