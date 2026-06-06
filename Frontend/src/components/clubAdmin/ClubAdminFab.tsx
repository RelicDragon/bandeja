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
    <div className="mb-2 flex justify-center">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 rounded-2xl border border-gray-300/60 bg-white/30 px-4 py-2 shadow-[0_-12px_48px_rgba(0,0,0,0.22),0_-4px_24px_rgba(0,0,0,0.14),-20px_0_40px_rgba(0,0,0,0.18),20px_0_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-gray-600/60 dark:bg-gray-900/30 dark:shadow-[0_0_12px_rgba(218,165,32,0.26),0_0_24px_rgba(255,215,0,0.07),0_-6px_20px_rgba(0,0,0,0.14)]"
      >
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{t('clubAdmin.myClubs')}</span>
      </button>
    </div>
  );
}
