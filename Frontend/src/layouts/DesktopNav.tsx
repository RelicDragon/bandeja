import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, User, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export const DesktopNav = () => {
  const { t } = useTranslation();
  const logout = useAuthStore((state) => state.logout);

  const navItems = [
    { to: '/', icon: Home, label: t('nav.home') },
    // { to: '/rating', icon: Award, label: t('nav.myRating') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-screen fixed left-0 top-0">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-primary-600 dark:text-primary-400">
          {t('app.title')}
        </h1>
      </div>

      <nav className="flex-1 p-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <LogOut size={20} />
          <span>{t('auth.logout')}</span>
        </button>
      </div>
    </aside>
  );
};

