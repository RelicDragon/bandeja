import axios from 'axios';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import { isCapacitor } from '@/utils/capacitor';

function applyApiBaseUrl(config: { baseURL?: string }) {
  config.baseURL = getApiAxiosBaseURL();
}

export const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10000,
  withCredentials: !isCapacitor(),
});

api.interceptors.request.use((config) => {
  applyApiBaseUrl(config);
  return config;
});
