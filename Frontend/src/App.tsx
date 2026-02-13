import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, lazy, Suspense, useState, useRef } from 'react';
import { ProtectedRoute, AppLoadingScreen, NoInternetScreen, AppVersionModal } from './components';
import { NavigationErrorBoundary } from './components/NavigationErrorBoundary';

const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Register = lazy(() => import('./pages/Register').then(module => ({ default: module.Register })));
const SelectCity = lazy(() => import('./pages/SelectCity').then(module => ({ default: module.SelectCity })));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile').then(module => ({ default: module.CompleteProfile })));
const MainPage = lazy(() => import('./pages/MainPage').then(module => ({ default: module.MainPage })));
const CreateGameWrapper = lazy(() => import('./pages/CreateGameWrapper').then(module => ({ default: module.CreateGameWrapper })));
const CreateLeague = lazy(() => import('./pages/CreateLeague').then(module => ({ default: module.CreateLeague })));
const CharCreation = lazy(() => import('./Gamify/Pages/CharCreation').then(module => ({ default: module.CharCreation })));
// const Rating = lazy(() => import('./pages/Rating').then(module => ({ default: module.Rating })));
const GameChatRoute = lazy(() => import('./pages/GameChatRoute').then(module => ({ default: module.GameChatRoute })));
import { useAuthStore } from './store/authStore';
import { useFavoritesStore } from './store/favoritesStore';
import { isProfileComplete } from './utils/userValidation';
import { usersApi } from './api';
import { PlayerCardModalManager } from './components/PlayerCardModalManager';
import { ToastProvider } from './components/ToastProvider';
import { PermissionModalProvider } from './components/PermissionModalProvider';
import { OfflineBanner } from './components/OfflineBanner';
import { headerService } from './services/headerService';
import { socketService } from './services/socketService';
import { useSocketEventsStore } from './store/socketEventsStore';
import { isCapacitor, isIOS, isAndroid } from './utils/capacitor';
import { unregisterServiceWorkers, clearAllCaches } from './utils/serviceWorkerUtils';
import { initNetworkListener, useNetworkStore } from './utils/networkStatus';
import { restoreAuthIfNeeded, monitorAuthPersistence } from './utils/authPersistence';
import { useDeepLink } from './hooks/useDeepLink';
import { extractLanguageCode } from './utils/displayPreferences';
import { useAppVersionCheck } from './hooks/useAppVersionCheck';
import { backButtonService } from './services/backButtonService';
import { appLifecycleService } from './services/appLifecycle.service';
import { navigationService } from './services/navigationService';
import { markNavigation, setupPopstateFallback } from './utils/navigation';
import { useUrlStoreSync } from './hooks/useUrlStoreSync';
import i18n from './i18n/config';
import './i18n/config';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const finishInitializing = useAuthStore((state) => state.finishInitializing);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const isOnline = useNetworkStore((state) => state.isOnline);
  const [showOptionalUpdateModal, setShowOptionalUpdateModal] = useState(false);
  const [dismissedOptionalUpdate, setDismissedOptionalUpdate] = useState<string | null>(null);

  const { versionCheck, isChecking: isCheckingVersion } = useAppVersionCheck();
  
  useDeepLink();
  useUrlStoreSync();

  useEffect(() => {
    navigationService.initialize(navigate);
    backButtonService.setNavigate(navigate);
  }, [navigate]);

  useEffect(() => {
    if (!isCapacitor()) return;
    const cleanupPopstate = setupPopstateFallback(navigate);
    return cleanupPopstate;
  }, [navigate]);

  const previousPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousPathnameRef.current !== null && previousPathnameRef.current !== location.pathname) {
      markNavigation();
    }
    previousPathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    restoreAuthIfNeeded();
    const cleanupAuthPersistence = monitorAuthPersistence();
    
    if (isCapacitor()) {
      document.body.classList.add('capacitor-app');
      if (isIOS()) {
        document.body.classList.add('capacitor-ios');
      }
      if (isAndroid()) {
        document.body.classList.add('capacitor-android');
      }
      backButtonService.initialize();
    }

    appLifecycleService.init();

    const cleanup = initNetworkListener();

    const timer = setTimeout(() => {
      finishInitializing();
    }, 500);

    return () => {
      cleanup();
      cleanupAuthPersistence();
      clearTimeout(timer);
      appLifecycleService.cleanup();
      if (isCapacitor()) {
        backButtonService.cleanup();
      }
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
      if (navigator.onLine) {
        usersApi.getProfile()
          .then((response: { data: any }) => {
            useAuthStore.getState().updateUser(response.data);
          })
          .catch((error: any) => {
            console.error('Failed to refresh user profile:', error);
          });
      }

      const timer = setTimeout(() => {
        headerService.startPolling();
        
        if (navigator.onLine) {
          fetchFavorites().catch((error) => {
            console.error('Failed to fetch favorites:', error);
          });
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        headerService.stopPolling();
      };
    } else {
      headerService.stopPolling();
    }
  }, [isAuthenticated, isInitializing, fetchFavorites]);

  const initializeSocketEvents = useSocketEventsStore((state) => state.initialize);
  const cleanupSocketEvents = useSocketEventsStore((state) => state.cleanup);

  useEffect(() => {
    if (isAuthenticated && !isInitializing) {
      const timer = setTimeout(() => {
        initializeSocketEvents();
      }, 500);

      const handleWalletUpdate = (data: { wallet: number }) => {
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          useAuthStore.getState().updateUser({ ...currentUser, wallet: data.wallet });
        }
      };

      socketService.on('wallet-update', handleWalletUpdate);

      return () => {
        clearTimeout(timer);
        cleanupSocketEvents();
        socketService.off('wallet-update', handleWalletUpdate);
      };
    }
  }, [isAuthenticated, isInitializing, initializeSocketEvents, cleanupSocketEvents]);

  useEffect(() => {
    if (versionCheck && versionCheck.status === 'optional_update' && !showOptionalUpdateModal) {
      const versionKey = versionCheck.minVersion || 'unknown';
      if (dismissedOptionalUpdate !== versionKey) {
        setShowOptionalUpdateModal(true);
      }
    }
  }, [versionCheck, showOptionalUpdateModal, dismissedOptionalUpdate]);

  if (isCheckingVersion || isInitializing) {
    return <AppLoadingScreen isInitializing={isInitializing} />;
  }

  if (versionCheck && versionCheck.status === 'blocking_update') {
    const offlineMessage = !isOnline 
      ? 'You are currently offline. Please connect to the internet to update the app.'
      : versionCheck.message;
    
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppVersionModal
          isBlocking={true}
          minVersion={versionCheck.minVersion}
          message={offlineMessage}
        />
      </div>
    );
  }

  const isGameDetailsPage = location.pathname.match(/^\/games\/[^/]+$/);
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  if (!isOnline && !isGameDetailsPage && !isAuthPage) {
    return <NoInternetScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <OfflineBanner />
      {showOptionalUpdateModal && versionCheck && versionCheck.status === 'optional_update' && (
        <AppVersionModal
          isBlocking={false}
          minVersion={versionCheck.minVersion}
          message={versionCheck.message}
          onClose={() => {
            setShowOptionalUpdateModal(false);
            const versionKey = versionCheck.minVersion || 'unknown';
            setDismissedOptionalUpdate(versionKey);
          }}
        />
      )}
      <ToastProvider>
        <PermissionModalProvider />
        <PlayerCardModalManager>
          <Routes>
        <Route
          path="/login/telegram"
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
          path="/login/phone"
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
          path="/chats/marketplace"
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
          path="/character"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                  <CharCreation />
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
                  <GameChatRoute />
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
          path="/marketplace"
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
          path="/marketplace/my"
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
          path="/marketplace/create"
          element={
            <ProtectedRoute>
              {!user?.currentCity && !user?.currentCityId ? (
                <Navigate to="/select-city" replace state={{ from: '/marketplace/create' }} />
              ) : !isProfileComplete(user) ? (
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
          path="/marketplace/:id/edit"
          element={
            <ProtectedRoute>
              {!user?.currentCity && !user?.currentCityId ? (
                <Navigate to="/select-city" replace state={{ from: location.pathname }} />
              ) : !isProfileComplete(user) ? (
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
          path="/marketplace/:id"
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
          path="/user-chat/:id"
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
          path="/group-chat/:id"
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
          path="/channel-chat/:id"
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
        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PlayerCardModalManager>
      </ToastProvider>
    </div>
  );
}

function App() {
  return (
    <NavigationErrorBoundary fallbackPath="/">
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </NavigationErrorBoundary>
  );
}

export default App;

