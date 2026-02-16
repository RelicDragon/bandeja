import api from './axios';

export const pushApi = {
  removeAllTokens: () => api.delete('/push/tokens'),
};
