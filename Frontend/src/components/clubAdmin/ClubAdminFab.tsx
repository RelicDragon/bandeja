import { Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';

export function ClubAdminFab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clubs = useAuthStore((s) => s.user?.clubAdminClubs ?? []);

  if (clubs.length === 0) return null;

  const handleClick = () => {
    if (clubs.length === 1) {
      navigate(`/my-clubs/${clubs[0].id}`);
    } else {
      navigate('/my-clubs');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background px-4 py-2 shadow-lg md:bottom-24"
    >
      <Building2 className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium">{t('clubAdmin.myClubs')}</span>
    </button>
  );
}
