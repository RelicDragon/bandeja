import axios, { AxiosError } from 'axios';
import { isCapacitor } from '@/utils/capacitor';
import { processDeletedUsers } from '@/utils/deletedUserHandler';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import { handleApiUnauthorizedIfNeeded } from '@/api/handleApiUnauthorized';

const api = axios.create({
  baseURL: getApiAxiosBaseURL(),
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
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
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      handleApiUnauthorizedIfNeeded();
    }
    return Promise.reject(error);
  }
);

export default api;

