import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import { ProtectedRoute, AppLoadingScreen, NoInternetScreen } from './components';

const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Register = lazy(() => import('./pages/Register').then(module => ({ default: module.Register })));
const SelectCity = lazy(() => import('./pages/SelectCity').then(module => ({ default: module.SelectCity })));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile').then(module => ({ default: module.CompleteProfile })));
const MainPage = lazy(() => import('./pages/MainPage').then(module => ({ default: module.MainPage })));
const CreateGameWrapper = lazy(() => import('./pages/CreateGameWrapper').then(module => ({ default: module.CreateGameWrapper })));
const CreateLeague = lazy(() => import('./pages/CreateLeague').then(module => ({ default: module.CreateLeague })));
// const Rating = lazy(() => import('./pages/Rating').then(module => ({ default: module.Rating })));
const GameChat = lazy(() => import('./pages/GameChat').then(module => ({ default: module.GameChat })));
import { useAuthStore } from './store/authStore';
import { useFavoritesStore } from './store/favoritesStore';
import { isProfileComplete } from './utils/userValidation';
import { usersApi } from './api';
import { PlayerCardModalManager } from './components/PlayerCardModalManager';
import { ToastProvider } from './components/ToastProvider';
import { OfflineBanner } from './components/OfflineBanner';
import { headerService } from './services/headerService';
import { socketService } from './services/socketService';
import { useHeaderStore } from './store/headerStore';
import { isCapacitor, isIOS, isAndroid } from './utils/capacitor';
import { unregisterServiceWorkers, clearAllCaches } from './utils/serviceWorkerUtils';
import { initNetworkListener, useNetworkStore } from './utils/networkStatus';
import { restoreAuthIfNeeded, monitorAuthPersistence } from './utils/authPersistence';
import { useDeepLink } from './hooks/useDeepLink';
import { extractLanguageCode } from './utils/displayPreferences';
import i18n from './i18n/config';
import './i18n/config';

function AppContent() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const finishInitializing = useAuthStore((state) => state.finishInitializing);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const isOnline = useNetworkStore((state) => state.isOnline);

  useDeepLink();

  useEffect(() => {
    restoreAuthIfNeeded();
    monitorAuthPersistence();
    
    if (isCapacitor()) {
      document.body.classList.add('capacitor-app');
      if (isIOS()) {
        document.body.classList.add('capacitor-ios');
      }
      if (isAndroid()) {
        document.body.classList.add('capacitor-android');
      }
    }
    
    const cleanup = initNetworkListener();
    
    // Mark initialization as complete
    // Even if offline, we want the app to finish initializing and show the UI
    const timer = setTimeout(() => {
      finishInitializing();
    }, 500);
    
    return () => {
      cleanup();
      clearTimeout(timer);
    };
  }, [finishInitializing]);

  useEffect(() => {
    if (user?.language) {
      const langCode = extractLanguageCode(user.language);
      if (langCode && i18n.language !== langCode) {
        i18n.changeLanguage(langCode);
      }
    }
  }, [user?.language]);

  useEffect(() => {
    const checkServiceWorker = async () => {
      if ('serviceWorker' in navigator && navigator.onLine) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            const response = await fetch('/sw.js', { 
              cache: 'no-cache',
              signal: controller.signal 
            });
            clearTimeout(timeout);
            
            if (!response.ok) {
              console.warn('Service worker file not found, unregistering...');
              await unregisterServiceWorkers();
              await clearAllCaches();
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.warn('Service worker check timed out');
          } else {
            console.error('Service worker check failed:', error);
          }
        }
      }
    };

    checkServiceWorker();
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isInitializing) {
      // Refresh user profile from backend to ensure all fields are up to date
      if (navigator.onLine) {
        usersApi.getProfile()
          .then((response: { data: any }) => {
            useAuthStore.getState().updateUser(response.data);
          })
          .catch((error: any) => {
            console.error('Failed to refresh user profile:', error);
          });
      }

      // Delay starting services to avoid blocking initial render
      const timer = setTimeout(() => {
        headerService.startPolling();
        
        // Only fetch favorites if online
        if (navigator.onLine) {
          fetchFavorites().catch((error) => {
            console.error('Failed to fetch favorites:', error);
          });
        }
      }, 300);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [isAuthenticated, isInitializing, fetchFavorites]);

  useEffect(() => {
    if (isAuthenticated && !isInitializing) {
      // Set up socket listener for new invites
      const handleNewInvite = () => {
        const { setPendingInvites, triggerNewInviteAnimation } = useHeaderStore.getState();
        // Increment the pending invites count
        const currentCount = useHeaderStore.getState().pendingInvites;
        setPendingInvites(currentCount + 1);
        // Trigger animation for new invite
        triggerNewInviteAnimation();
      };

      const handleInviteDeleted = () => {
        const { setPendingInvites } = useHeaderStore.getState();
        // Decrement the pending invites count (minimum 0)
        const currentCount = useHeaderStore.getState().pendingInvites;
        setPendingInvites(Math.max(0, currentCount - 1));
      };

      const timer = setTimeout(() => {
        socketService.on('new-invite', handleNewInvite);
        socketService.on('invite-deleted', handleInviteDeleted);
      }, 500);

      return () => {
        clearTimeout(timer);
        socketService.off('new-invite', handleNewInvite);
        socketService.off('invite-deleted', handleInviteDeleted);
      };
    }
  }, [isAuthenticated, isInitializing]);


  if (isInitializing) {
    return <AppLoadingScreen isInitializing={isInitializing} />;
  }

  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/);
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  if (!isOnline && !isGameDetailsPage && !isAuthPage) {
    return <NoInternetScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <OfflineBanner />
      <ToastProvider>
        <PlayerCardModalManager>
          <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <Login />
              </Suspense>
            )
          }
        />
        <Route
          path="/register"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <Register />
              </Suspense>
            )
          }
        />
        <Route
          path="/select-city"
          element={
            <ProtectedRoute>
              {user?.currentCity ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <SelectCity />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/complete-profile"
          element={
            <ProtectedRoute>
              {isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <CompleteProfile />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {!user?.currentCity ? (
                <Navigate to="/select-city" replace />
              ) : !isProfileComplete(user) ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/find"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/chats"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:id"
          element={
            isAuthenticated && !isProfileComplete(user) ? (
              <Navigate to="/" replace />
            ) : (
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            )
          }
        />
        <Route
          path="/create-game"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <CreateGameWrapper />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-league"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <CreateLeague />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        {/* <Route
          path="/rating"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Rating />
              )}
            </ProtectedRoute>
          }
        /> */}
        <Route
          path="/games/:id/chat"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <GameChat />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/bugs"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/game-subscriptions"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <MainPage />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/bugs/:id/chat"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <GameChat />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-chat/:id"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <GameChat />
                </Suspense>
              )}
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PlayerCardModalManager>
      </ToastProvider>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

