import axios, { AxiosError } from 'axios';
import { isCapacitor } from '@/utils/capacitor';

const getBaseURL = () => {
  if (isCapacitor()) {
    return 'https://bandeja.me/api';
  }
  return '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !navigator.onLine) {
      console.warn('Network error detected:', error.message);
      const networkError = new Error('Network unavailable');
      networkError.name = 'NetworkError';
      return Promise.reject(networkError);
    }
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

