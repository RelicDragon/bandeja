import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, lazy, Suspense, useState, useRef } from 'react';
import { ProtectedRoute, AppLoadingScreen, NoInternetScreen, AppVersionModal } from './components';
import { NavigationErrorBoundary } from './components/NavigationErrorBoundary';

const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const TelegramAutoLogin = lazy(() => import('./pages/TelegramAutoLogin').then(module => ({ default: module.TelegramAutoLogin })));
const Register = lazy(() => import('./pages/Register').then(module => ({ default: module.Register })));
const SessionsPage = lazy(() =>
  import('./pages/SessionsPage').then((module) => ({ default: module.SessionsPage }))
);
const SelectCity = lazy(() => import('./pages/SelectCity').then(module => ({ default: module.SelectCity })));
const MainPage = lazy(() => import('./pages/MainPage').then(module => ({ default: module.MainPage })));
const CreateGameWrapper = lazy(() => import('./pages/CreateGameWrapper').then(module => ({ default: module.CreateGameWrapper })));
const CreateLeague = lazy(() => import('./pages/CreateLeague').then(module => ({ default: module.CreateLeague })));
// const Rating = lazy(() => import('./pages/Rating').then(module => ({ default: module.Rating })));
const GameChatRoute = lazy(() => import('./pages/GameChatRoute').then(module => ({ default: module.GameChatRoute })));
import { useAuthStore } from './store/authStore';
import { useFavoritesStore } from './store/favoritesStore';
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
import { cleanupCapacitorNetwork } from './utils/capacitorNetwork';
import { initNetworkListener, useNetworkStore } from './utils/networkStatus';
import { refreshChatOfflineBanner } from '@/services/chat/chatOfflineBanner';
import { restoreAuthIfNeeded, monitorAuthPersistence } from './utils/authPersistence';
import { useDeepLink } from './hooks/useDeepLink';
import { useDeepLinkStore } from './store/deepLinkStore';
import { extractLanguageCode } from './utils/displayPreferences';
import { syncWatchPreferencesToNative } from './services/authBridge';
import { Capacitor } from '@capacitor/core';
import { GeoProvider } from './contexts/GeoProvider';
import { useAppVersionCheck } from './hooks/useAppVersionCheck';
import { backButtonService } from './services/backButtonService';
import { appLifecycleService } from './services/appLifecycle.service';
import { ensureChatSyncWarmBootstrap, warmChatSyncHeads } from '@/services/chat/chatSyncBatchWarm';
import { scheduleUnifiedChatOfflineFlush } from '@/services/chat/chatUnifiedOfflineFlush';
import pushNotificationService from './services/pushNotificationService';
import { navigationService } from './services/navigationService';
import { markNavigation, setupPopstateFallback } from './utils/navigation';
import { ensureAuthBroadcastListener, scheduleProactiveAccessRefresh } from '@/api/authRefresh';
import { useUrlStoreSync } from './hooks/useUrlStoreSync';
import { usePresenceSubscriptionManager } from './hooks/usePresenceSubscriptionManager';
import { ReactionEmojiUsageBootstrap } from './components/ReactionEmojiUsageBootstrap';
import { ProfileNameGateHost } from './components/home/ProfileNameGateHost';
import i18n from './i18n/config';
import './i18n/config';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const finishInitializing = useAuthStore((state) => state.finishInitializing);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const isOnline = useNetworkStore((state) => state.isOnline);
  const [showOptionalUpdateModal, setShowOptionalUpdateModal] = useState(false);
  const [dismissedOptionalUpdate, setDismissedOptionalUpdate] = useState<string | null>(null);

  const { versionCheck, isChecking: isCheckingVersion } = useAppVersionCheck();
  
  useDeepLink();
  useUrlStoreSync();

  const pendingAuthPath = useDeepLinkStore((s) => s.pendingAuthPath);
  const setPendingAuthPath = useDeepLinkStore((s) => s.setPendingAuthPath);
  useEffect(() => {
    if (
      !isAuthenticated &&
      location.pathname === '/login' &&
      pendingAuthPath &&
      pendingAuthPath.startsWith('/login/') &&
      pendingAuthPath !== '/login/phone' &&
      pendingAuthPath !== '/login/telegram'
    ) {
      setPendingAuthPath(null);
      navigate(pendingAuthPath, { replace: true });
    }
  }, [isAuthenticated, location.pathname, pendingAuthPath, setPendingAuthPath, navigate]);

  useEffect(() => {
    if (location.pathname !== '/login' || !isAuthenticated) return;
    console.warn('[auth:login-route] authenticated on /login → Navigate to / (this is why logout can bounce to home)', {
      hasStoreToken: !!token,
      lsToken: typeof localStorage !== 'undefined' ? !!localStorage.getItem('token') : null,
    });
  }, [location.pathname, isAuthenticated, token]);

  useEffect(() => {
    navigationService.initialize(navigate);
    backButtonService.setNavigate(navigate);
  }, [navigate]);

  useEffect(() => {
    ensureAuthBroadcastListener();
  }, []);

  useEffect(() => {
    if (isInitializing || !token) return;
    scheduleProactiveAccessRefresh(token);
  }, [isInitializing, token]);

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
    const syncChatNet = () => {
      const online = useNetworkStore.getState().isOnline;
      refreshChatOfflineBanner();
      if (online && useAuthStore.getState().isAuthenticated) {
        void warmChatSyncHeads(undefined, { enrichFromUnread: true });
        scheduleUnifiedChatOfflineFlush();
      }
    };
    syncChatNet();
    return useNetworkStore.subscribe(syncChatNet);
  }, []);

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

    finishInitializing();
    if (isCapacitor() && useAuthStore.getState().isAuthenticated) {
      void pushNotificationService.ensureTokenSentToBackend();
    }

    return () => {
      cleanup();
      cleanupAuthPersistence();
      appLifecycleService.cleanup();
      if (isCapacitor()) {
        backButtonService.cleanup();
        cleanupCapacitorNetwork();
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
    if (Capacitor.getPlatform() !== 'ios' || !user) return;
    void syncWatchPreferencesToNative(user);
  }, [user]);

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

  useEffect(() => {
    if (!isAuthenticated || isInitializing) return;
    void ensureChatSyncWarmBootstrap();
  }, [isAuthenticated, isInitializing]);

  const initializeSocketEvents = useSocketEventsStore((state) => state.initialize);
  const cleanupSocketEvents = useSocketEventsStore((state) => state.cleanup);
  usePresenceSubscriptionManager();

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
  const isUserProfilePage = location.pathname.match(/^\/user-profile\/[^/]+$/);
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  if (!isOnline && !isGameDetailsPage && !isUserProfilePage && !isAuthPage) {
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
      <GeoProvider>
        <ToastProvider>
          <ProfileNameGateHost />
          <PermissionModalProvider />
          <ReactionEmojiUsageBootstrap />
          <PlayerCardModalManager>
            <Routes>
        <Route
          path="/login/:telegramKey"
          element={
            <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
              <TelegramAutoLogin />
            </Suspense>
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
        <Route path="/welcome" element={<Navigate to="/" replace />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/find"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/chats/marketplace"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/chats"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/sessions"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <SessionsPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-team/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:id"
          element={
            <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
              <MainPage />
            </Suspense>
          }
        />
        <Route
          path="/user-profile/:userId"
          element={
            <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
              <MainPage />
            </Suspense>
          }
        />
        <Route
          path="/create-game"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <CreateGameWrapper />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-league"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <CreateLeague />
              </Suspense>
            </ProtectedRoute>
          }
        />
        {/* <Route path="/rating" element={<ProtectedRoute><Rating /></ProtectedRoute>} /> */}
        <Route
          path="/games/:id/chat"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <GameChatRoute />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bugs/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bugs"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace/my"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace/create"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace/:id/edit"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marketplace/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/game-subscriptions"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-chat/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/group-chat/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/channel-chat/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AppLoadingScreen isInitializing={true} />}>
                <MainPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PlayerCardModalManager>
        </ToastProvider>
      </GeoProvider>
    </div>
  );
}

function App() {
  return (
    <NavigationErrorBoundary fallbackPath="/">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppContent />
      </BrowserRouter>
    </NavigationErrorBoundary>
  );
}

export default App;

