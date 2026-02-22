import { isCapacitor } from './capacitor';

const EULA_PATH = '/eula/world/eula.html';

export const openEula = () => {
  if (isCapacitor()) {
    window.location.href = EULA_PATH + '?inapp=1';
  } else {
    window.open(EULA_PATH, '_blank', 'noopener,noreferrer');
  }
};
