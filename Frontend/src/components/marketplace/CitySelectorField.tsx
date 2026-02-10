import { useState, useRef, useEffect } from 'react';
import { City } from '@/types';
import { X, Plus, MapPin } from 'lucide-react';

interface CitySelectorFieldProps {
  primaryCityId: string;
  primaryCityName: string;
  additionalCityIds: string[];
  cities: City[];
  onAddCity: (cityId: string) => void;
  onRemoveCity: (cityId: string) => void;
  disabled?: boolean;
}

export function CitySelectorField({
  primaryCityId,
  primaryCityName,
  additionalCityIds,
  cities,
  onAddCity,
  onRemoveCity,
  disabled,
}: CitySelectorFieldProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  // Get available cities (excluding primary and already selected)
  const availableCities = cities.filter(
    (city) => city.id !== primaryCityId && !additionalCityIds.includes(city.id)
  );

  const handleCitySelect = (cityId: string) => {
    onAddCity(cityId);
    setShowDropdown(false);
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        <MapPin size={14} className="inline mr-1" />
        Cities where this item will be visible
      </label>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Primary city chip (non-removable) */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-sm font-medium">
          {primaryCityName}
          <span className="text-xs opacity-80 ml-0.5">(primary)</span>
        </div>

        {/* Additional city chips (removable) */}
        {additionalCityIds.map((cityId) => {
          const city = cities.find((c) => c.id === cityId);
          if (!city) return null;

          return (
            <div
              key={cityId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-medium"
            >
              {city.name}
              <button
                type="button"
                onClick={() => onRemoveCity(cityId)}
                disabled={disabled}
                className="ml-1 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-full p-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Remove ${city.name}`}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}

        {/* Add city button with dropdown */}
        {availableCities.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={disabled}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Add City
            </button>

            {/* Dropdown menu */}
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto">
                {availableCities.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => handleCitySelect(city.id)}
                    className="w-full text-left px-4 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors first:rounded-t-lg last:rounded-b-lg"
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Your item will be visible to users in all selected cities. The primary city is used for the item's chat channel.
      </p>
    </div>
  );
}
