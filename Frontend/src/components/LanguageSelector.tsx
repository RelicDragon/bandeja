import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const languages = [
    { value: 'en', label: 'EN', fullLabel: 'English', flag: '🇬🇧' },
    { value: 'ru', label: 'RU', fullLabel: 'Русский', flag: '🇷🇺' },
    { value: 'sr', label: 'SR', fullLabel: 'Српски', flag: '🇷🇸' },
    { value: 'es', label: 'ES', fullLabel: 'Español', flag: '🇪🇸' },
  ];

  const currentLanguage = languages.find(lang => lang.value === i18n.language) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChangeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm"
        aria-label="Select language"
      >
        <span className="text-base">{currentLanguage.flag}</span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{currentLanguage.label}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div 
        className={`absolute right-0 top-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 z-50 min-w-[160px] overflow-hidden origin-top-right transition-all duration-200 ${
          isOpen 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        }`}
      >
        {languages.map((lang, index) => (
          <button
            key={lang.value}
            type="button"
            onClick={() => handleChangeLanguage(lang.value)}
            className={`w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2.5 transition-all duration-200 ${
              lang.value === i18n.language 
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' 
                : 'text-slate-700 dark:text-slate-200'
            }`}
            style={{ 
              transitionDelay: isOpen ? `${index * 50}ms` : '0ms',
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? 'translateX(0)' : 'translateX(-8px)'
            }}
          >
            <span className="text-lg">{lang.flag}</span>
            <span className="text-sm font-medium">{lang.fullLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
