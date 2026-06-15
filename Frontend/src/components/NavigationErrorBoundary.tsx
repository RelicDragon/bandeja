import { Component, ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { isChunkLoadError, recoverFromChunkLoadError } from '@/utils/chunkLoadRecovery';

interface Props extends WithTranslation {
  children: ReactNode;
  fallbackPath?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

class NavigationErrorBoundaryBase extends Component<Props, State> {
  private reloadTimeout: NodeJS.Timeout | null = null;
  private readonly MAX_RETRIES = 1;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
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
      
      this.setState(prevState => ({ retryCount: prevState.retryCount + 1 }));
      
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

  private handleBack = () => {
    this.clearReloadTimeout();
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(this.props.fallbackPath ?? '/');
  };

  private handleTryAgain = () => {
    this.clearReloadTimeout();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200/80 bg-white px-6 py-8 text-center shadow-lg shadow-gray-900/5 dark:border-gray-700/80 dark:bg-gray-800 dark:shadow-black/20">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
              {t('errors.generic', { defaultValue: 'Something went wrong' })}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {t('errors.navigationError', {
                defaultValue: "This page didn't load correctly. Go back or try again.",
              })}
            </p>
            <div
              className="mx-auto mt-6 h-9 w-9 animate-spin rounded-full border-[3px] border-primary-600/25 border-t-primary-600"
              aria-hidden
            />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto sm:min-w-[8.5rem]"
                onClick={this.handleBack}
              >
                <ArrowLeft size={18} aria-hidden />
                {t('common.back', { defaultValue: 'Back' })}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto sm:min-w-[8.5rem]"
                onClick={this.handleTryAgain}
              >
                <RefreshCw size={18} aria-hidden />
                {t('errors.tryAgain', { defaultValue: 'Try again' })}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const NavigationErrorBoundary = withTranslation()(NavigationErrorBoundaryBase);
