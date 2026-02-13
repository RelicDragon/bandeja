import { NavigateFunction } from 'react-router-dom';
import { homeUrl, isAppPath } from './urlSchema';

const SAFETY_CHECK_MS = 350;

export type BackAction =
  | { type: 'history' }
  | { type: 'home'; url: string };

export function getBackAction(): BackAction {
  const idx = window.history.state?.idx;
  if (typeof idx === 'number' && idx > 0) {
    return { type: 'history' };
  }
  return { type: 'home', url: homeUrl() };
}

export function handleBack(navigate: NavigateFunction): void {
  const action = getBackAction();

  if (action.type === 'history') {
    const previousPathname = window.location.pathname;
    navigate(-1);

    setTimeout(() => {
      const currentPathname = window.location.pathname;
      if (currentPathname === previousPathname || !isAppPath(currentPathname)) {
        navigate(homeUrl(), { replace: true });
      }
    }, SAFETY_CHECK_MS);
  } else {
    navigate(action.url, { replace: true });
  }
}
