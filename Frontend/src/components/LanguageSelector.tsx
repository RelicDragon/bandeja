import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const LanguageSelector = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const languages = [
    { value: 'en', label: 'EN', fullLabel: 'English', flag: '🇬🇧' },
    { value: 'ru', label: 'RU', fullLabel: 'Русский', flag: '🇷🇺' },
    { value: 'sr', label: 'SR', fullLabel: 'Српски', flag: '🇷🇸' },
    { value: 'es', label: 'ES', fullLabel: 'Español', flag: '🇪🇸' },
  ];

  const currentLanguage = languages.find(lang => lang.value === i18n.language) || languages[0];

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 8,
      left: rect.right - 160,
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      const handleResize = () => updateDropdownPosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleResize, true);
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleResize, true);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(event.target as Node) &&
        menuRef.current && !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleChangeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm"
          aria-label="Select language"
        >
          <span className="text-base">{currentLanguage.flag}</span>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{currentLanguage.label}</span>
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && dropdownPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 z-[10000] min-w-[160px] overflow-hidden origin-top-right transition-all duration-200 opacity-100 scale-100 translate-y-0"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
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
                transitionDelay: `${index * 50}ms`,
              }}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="text-sm font-medium">{lang.fullLabel}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};
