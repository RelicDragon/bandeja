export interface DisplayPreferences {
  language?: string; // Full locale (e.g., "en-US", "ru-RU") or "auto"
  timeFormat?: 'auto' | '12h' | '24h';
  weekStart?: 'auto' | 'monday' | 'sunday';
}

export interface ResolvedDisplaySettings {
  locale: string;
  hour12: boolean;
  weekStart: 0 | 1;
}

export function extractLanguageCode(locale: string): string {
  if (!locale || locale === 'auto') {
    return navigator.language.split('-')[0].toLowerCase();
  }
  return locale.split('-')[0].toLowerCase();
}

export function getWeekStartFromLocale(locale: string): 0 | 1 {
  const sundayLocales = ['en-US', 'en-CA', 'en-PH', 'en-AU'];
  return sundayLocales.includes(locale) ? 0 : 1;
}

export function detectTimeFormat(locale: string): '12h' | '24h' {
  try {
    const detected = new Intl.DateTimeFormat(locale).resolvedOptions().hour12 ?? false;
    return detected ? '12h' : '24h';
  } catch (error) {
    console.error('Error detecting time format:', error);
    return '24h';
  }
}

export function detectWeekStart(locale: string): 'sunday' | 'monday' {
  const detected = getWeekStartFromLocale(locale);
  return detected === 0 ? 'sunday' : 'monday';
}

export function resolveDisplaySettings(
  prefs: DisplayPreferences | null | undefined
): ResolvedDisplaySettings {
  const deviceLocale = navigator.language || 'en-US';

  if (!prefs) {
    return {
      locale: deviceLocale,
      hour12: detectTimeFormat(deviceLocale) === '12h',
      weekStart: getWeekStartFromLocale(deviceLocale),
    };
  }

  let locale: string;
  if (prefs.language === 'auto' || !prefs.language) {
    locale = deviceLocale;
  } else {
    locale = prefs.language;
  }

  let hour12: boolean;
  if (prefs.timeFormat === '12h') {
    hour12 = true;
  } else if (prefs.timeFormat === '24h') {
    hour12 = false;
  } else {
    const detectedFormat = detectTimeFormat(locale);
    hour12 = detectedFormat === '12h';
  }

  const weekStart =
    prefs.weekStart === 'sunday'
      ? 0
      : prefs.weekStart === 'monday'
      ? 1
      : getWeekStartFromLocale(locale);

  return { locale, hour12, weekStart };
}

export function formatGameTime(
  utcDate: string,
  settings: ResolvedDisplaySettings
): string {
  try {
    return new Intl.DateTimeFormat(settings.locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: settings.hour12,
    }).format(new Date(utcDate));
  } catch (error) {
    console.error('Error formatting game time:', error);
    const date = new Date(utcDate);
    if (settings.hour12) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } else {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }
}

