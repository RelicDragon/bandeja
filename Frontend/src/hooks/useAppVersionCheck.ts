import { useState, useEffect } from 'react';
import { AppVersionService, VersionCheckResult } from '@/services/appVersion.service';

export const useAppVersionCheck = () => {
  const [versionCheck, setVersionCheck] = useState<VersionCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const result = await AppVersionService.checkVersion();
        setVersionCheck(result);
      } catch (error) {
        console.error('Version check failed:', error);
        setVersionCheck({ status: 'ok' });
      } finally {
        setIsChecking(false);
      }
    };

    checkVersion();
  }, []);

  return { versionCheck, isChecking };
};
