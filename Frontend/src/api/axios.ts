import { AxiosError } from 'axios';
import { isCapacitor } from '@/utils/capacitor';
import { processDeletedUsers } from '@/utils/deletedUserHandler';
import { getClientAppSemver } from '@/utils/clientAppVersion';
import { Capacitor } from '@capacitor/core';
import { handleAxios401MaybeRefresh } from '@/api/authRefresh';
import { api } from '@/api/httpClient';

function clientPlatformHeader(): string {
  if (!isCapacitor()) return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'ios') return 'ios';
  if (p === 'android') return 'android';
  return 'unknown';
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Client-Version'] = getClientAppSemver();
    config.headers['X-Client-Platform'] = clientPlatformHeader();

    if (!isCapacitor()) {
      config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      config.headers['Pragma'] = 'no-cache';
      config.headers['Expires'] = '0';
      config.params = { ...config.params, _t: Date.now() };
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    if (response.data) {
      response.data = processDeletedUsers(response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      if ((error.config as { skipAuth401Handler?: boolean } | undefined)?.skipAuth401Handler) {
        return Promise.reject(error);
      }
      try {
        return await handleAxios401MaybeRefresh(error);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
