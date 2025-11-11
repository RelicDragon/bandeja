import { create } from 'zustand';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  setAuth: (user: User, token: string) => void;
  setToken: (token: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  finishInitializing: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  let savedUser = null;
  let savedToken = null;
  
  try {
    const userStr = localStorage.getItem('user');
    const tokenStr = localStorage.getItem('token');
    savedUser = userStr ? JSON.parse(userStr) : null;
    savedToken = tokenStr;
  } catch (error) {
    console.error('Error loading auth from localStorage:', error);
  }

  return {
    user: savedUser,
    token: savedToken,
    isAuthenticated: !!savedToken,
    isInitializing: true,
    setAuth: (user, token) => {
      try {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
        set({ user, token, isAuthenticated: true });
      } catch (error) {
        console.error('Error saving auth to localStorage:', error);
      }
    },
    setToken: (token) => {
      try {
        localStorage.setItem('token', token);
        set({ token, isAuthenticated: true });
      } catch (error) {
        console.error('Error saving token to localStorage:', error);
      }
    },
    logout: () => {
      try {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false });
      } catch (error) {
        console.error('Error clearing auth from localStorage:', error);
      }
    },
    updateUser: (user) => {
      try {
        localStorage.setItem('user', JSON.stringify(user));
        set({ user });
      } catch (error) {
        console.error('Error updating user in localStorage:', error);
      }
    },
    finishInitializing: () => {
      set({ isInitializing: false });
    },
  };
});

