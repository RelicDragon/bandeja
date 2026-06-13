import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { needsCityPicker } from '@/utils/needsCityPicker';

export function CityPickerRedirectHost() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!needsCityPicker(user)) return;
    if (location.pathname === '/select-city') return;
    navigate('/select-city', { replace: true });
  }, [user, location.pathname, navigate]);

  return null;
}
