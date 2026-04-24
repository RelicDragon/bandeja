import axios from 'axios';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import { isCapacitor } from '@/utils/capacitor';

export const api = axios.create({
  baseURL: getApiAxiosBaseURL(),
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 10000,
  withCredentials: !isCapacitor(),
});
