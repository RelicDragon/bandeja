import { Component, Fragment, ReactNode } from 'react';
import { isChunkLoadError, recoverFromChunkLoadError } from '@/utils/chunkLoadRecovery';
import { NavigationErrorFallback } from '@/components/NavigationErrorFallback';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  recoveryKey: number;
}

export class NavigationErrorBoundary extends Component<Props, State> {
  private reloadTimeout: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 1;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0, recoveryKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[NavigationErrorBoundary] Caught error:', error, errorInfo);

    if (isChunkLoadError(error)) {
      void recoverFromChunkLoadError();
      return;
    }

    if (this.state.retryCount >= this.MAX_RETRIES) {
      console.error('[NavigationErrorBoundary] Max retries reached, performing hard reload');
      window.location.reload();
      return;
    }

    const isNavigationError =
      error.message.includes('navigation') ||
      error.message.includes('history') ||
      error.message.includes('route') ||
      error.message.includes('Router');

    if (isNavigationError) {
      console.error('[NavigationErrorBoundary] Navigation error detected, reloading page');

      this.setState((prevState) => ({ retryCount: prevState.retryCount + 1 }));

      if (this.reloadTimeout) {
        clearTimeout(this.reloadTimeout);
      }

      this.reloadTimeout = setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }

  componentWillUnmount() {
    this.clearReloadTimeout();
  }

  private clearReloadTimeout = () => {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
      this.reloadTimeout = null;
    }
  };

  private resetAfterNavigation = () => {
    this.setState((prevState) => ({
      hasError: false,
      error: null,
      retryCount: 0,
      recoveryKey: prevState.recoveryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <NavigationErrorFallback
          onClearPending={this.clearReloadTimeout}
          onRecover={this.resetAfterNavigation}
        />
      );
    }

    return <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>;
  }
}
