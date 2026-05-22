import { useCallback, useState } from 'react';
import type { Sport } from '@/sport/sportRegistry';
import {
  DEFAULT_REGISTRATION_SPORT,
  readRegistrationPrimarySport,
  writeRegistrationPrimarySport,
} from '@/utils/registrationPrimarySport';

export function useRegistrationPrimarySport() {
  const [primarySport, setPrimarySportState] = useState<Sport>(() => readRegistrationPrimarySport());

  const setPrimarySport = useCallback((sport: Sport) => {
    setPrimarySportState(sport);
    writeRegistrationPrimarySport(sport);
  }, []);

  return {
    primarySport,
    setPrimarySport,
    defaultSport: DEFAULT_REGISTRATION_SPORT,
  };
}
