import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ProtectedRoute } from './components';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { SelectCity } from './pages/SelectCity';
import { CompleteProfile } from './pages/CompleteProfile';
import { MainPage } from './pages/MainPage';
import { CreateGameWrapper } from './pages/CreateGameWrapper';
// import { Rating } from './pages/Rating';
import { GameChat } from './pages/GameChat';
import { ChatList } from './pages/ChatList';
import { GameResultsEntry } from './pages/GameResultsEntry';
import { BugChat } from './pages/BugChat';
import { useAuthStore } from './store/authStore';
import { isProfileComplete, hasValidUsername } from './utils/userValidation';
import { PlayerCardModalManager } from './components/PlayerCardModalManager';
import { ToastProvider } from './components/ToastProvider';
import { headerService } from './services/headerService';
import { socketService } from './services/socketService';
import { useHeaderStore } from './store/headerStore';
import './i18n/config';

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isAuthenticated) {
      headerService.startPolling();

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

      socketService.on('new-invite', handleNewInvite);
      socketService.on('invite-deleted', handleInviteDeleted);

      return () => {
        socketService.off('new-invite', handleNewInvite);
        socketService.off('invite-deleted', handleInviteDeleted);
        headerService.stopPolling();
      };
    } else {
      headerService.stopPolling();
    }

    return () => {
      headerService.stopPolling();
    };
  }, [isAuthenticated]);


  return (
    <ToastProvider>
      <PlayerCardModalManager>
        <BrowserRouter>
        <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Register />}
        />
        <Route
          path="/select-city"
          element={
            <ProtectedRoute>
              {user?.currentCity ? <Navigate to="/" replace /> : <SelectCity />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/complete-profile"
          element={
            <ProtectedRoute>
              {hasValidUsername(user) ? <Navigate to="/" replace /> : <CompleteProfile />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {!user?.currentCity ? (
                <Navigate to="/select-city" replace />
              ) : !hasValidUsername(user) ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <MainPage />
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
                <MainPage />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:id"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <MainPage />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-game"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <CreateGameWrapper />
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
          path="/games/:id/results"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <GameResultsEntry />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:id/chat"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <GameChat />
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              {!isProfileComplete(user) ? (
                <Navigate to="/" replace />
              ) : (
                <ChatList />
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
                <MainPage />
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
                <BugChat />
              )}
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </PlayerCardModalManager>
    </ToastProvider>
  );
}

export default App;

