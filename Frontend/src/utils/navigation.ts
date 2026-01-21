const NAVIGATION_TRACK_KEY = 'app_navigation_tracked';

export const markNavigation = (): void => {
  sessionStorage.setItem(NAVIGATION_TRACK_KEY, 'true');
};

export const canNavigateBack = (): boolean => {
  if (window.history.length <= 1) {
    return false;
  }
  
  const hasNavigatedWithinApp = sessionStorage.getItem(NAVIGATION_TRACK_KEY) === 'true';
  
  if (!hasNavigatedWithinApp) {
    const referrer = document.referrer;
    if (!referrer) {
      return false;
    }
    
    try {
      const referrerUrl = new URL(referrer);
      const currentUrl = new URL(window.location.href);
      
      if (referrerUrl.origin !== currentUrl.origin) {
        return false;
      }
    } catch {
      return false;
    }
  }
  
  return true;
};
