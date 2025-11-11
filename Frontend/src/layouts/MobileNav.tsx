import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, User } from 'lucide-react';

export const MobileNav = () => {
  const { t } = useTranslation();

  const navItems = [
    { to: '/', icon: Home, label: t('nav.home') },
    // { to: '/rating', icon: Award, label: t('nav.myRating') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex justify-around items-center h-16">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 h-full ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`
            }
          >
            <Icon size={24} />
            <span className="text-xs mt-1">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

