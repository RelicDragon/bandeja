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
    
    if (tokenStr) {
      savedToken = tokenStr;
      console.log('Token loaded from localStorage');
    }
    
    if (userStr) {
      savedUser = JSON.parse(userStr);
      console.log('User loaded from localStorage');
    }
  } catch (error) {
    console.error('Error loading auth from localStorage:', error);
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    } catch (cleanupError) {
      console.error('Error cleaning up corrupted localStorage:', cleanupError);
    }
  }

  return {
    user: savedUser,
    token: savedToken,
    isAuthenticated: !!savedToken,
    isInitializing: true,
    setAuth: (user, token) => {
      try {
        const userJson = JSON.stringify(user);
        localStorage.setItem('user', userJson);
        localStorage.setItem('token', token);
        set({ user, token, isAuthenticated: true });
        console.log('Auth saved to localStorage');
        
        setTimeout(() => {
          const verifyUser = localStorage.getItem('user');
          const verifyToken = localStorage.getItem('token');
          if (!verifyUser || !verifyToken) {
            console.error('localStorage verification failed - data not persisted');
          }
        }, 100);
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

