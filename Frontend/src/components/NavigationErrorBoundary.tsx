import { Component, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';

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
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t('errors.generic', { defaultValue: 'Something went wrong' })}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {t('errors.navigationError', { defaultValue: "We're having trouble navigating. Refreshing the page..." })}
            </p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const NavigationErrorBoundary = withTranslation()(NavigationErrorBoundaryBase);
