import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { rememberPostLoginPath } from '@/utils/postLoginRedirect';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { decideOnboardingGate } from '@/components/onboarding/onboardingGate';
import { rememberPostOnboardingPath } from '@/components/onboarding/postOnboardingPath';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const location = useLocation();
  const { status } = useOnboardingStatus();

  if (!isAuthenticated) {
    rememberPostLoginPath(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to="/login" replace />;
  }

  // PRD 350 — first-run gate. `decideOnboardingGate` deliberately allows every
  // route while `isInitializing` is true (this component does not wait for the
  // shell bootstrap the way `holdShellForBootstrap` does) and while the status
  // is unknown, so a cold start or a failed request never bounces anyone.
  const gate = decideOnboardingGate({
    isAuthenticated,
    isInitializing,
    status,
    pathname: location.pathname,
  });

  if (gate.action === 'redirect') {
    // Keep the destination the user was actually heading for; the flow hands
    // it back after the last step instead of swallowing it.
    rememberPostOnboardingPath(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={gate.to} replace />;
  }

  return <>{children}</>;
};
