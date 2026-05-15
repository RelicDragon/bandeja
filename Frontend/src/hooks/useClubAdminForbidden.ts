import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';

export function useClubAdminForbidden() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return useCallback(
    (err: unknown): boolean => {
      if (isAxiosError(err) && err.response?.status === 403) {
        toast.error(t('clubAdmin.accessRevoked'));
        navigate('/my-clubs', { replace: true });
        return true;
      }
      return false;
    },
    [navigate, t]
  );
}
