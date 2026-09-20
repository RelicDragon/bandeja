/**
 * PRD 357 — backend copy for the weather alert (push + Telegram).
 *
 * Kept here rather than appended to `utils/translations.ts` for the same reason
 * `services/gameSeries/gameSeriesCopy.ts` is: that file is one flat object per
 * locale that a dozen agents in this programme are editing, and eleven
 * insertions into it would be a guaranteed merge conflict for zero behavioural
 * gain. The resolver has the same contract as `t(key, lang)`.
 *
 * **No unit or percent sign appears in a template.** Percentages, wind speeds
 * and clock times are produced by `Intl` for the recipient's locale and then
 * interpolated, so Arabic gets `٪` placement and Czech gets a non-breaking
 * space before `km/h` without anybody hard-coding it.
 */

export type WeatherCopyKey =
  | 'weather.alertTitleRain'
  | 'weather.alertTitleHeavy'
  | 'weather.alertTitleStorm'
  | 'weather.alertTitleWind'
  | 'weather.alertTitleWorse'
  | 'weather.alertBodyRain'
  | 'weather.alertBodyWind'
  | 'weather.alertOrganizerHint'
  | 'weather.alertParticipantHint'
  | 'weather.actionMoveIndoor'
  | 'weather.actionKeepAsPlanned'
  | 'weather.actionViewForecast'
  | 'weather.keptAsPlanned'
  | 'weather.keepFailed'
  | 'weather.outdoorCourt';

type WeatherCopyBundle = Record<WeatherCopyKey, string>;

const WEATHER_COPY: Record<string, WeatherCopyBundle> = {
  en: {
    'weather.alertTitleRain': 'Rain likely for your game ☔',
    'weather.alertTitleHeavy': 'Heavy rain expected for your game ☔',
    'weather.alertTitleStorm': 'Storm expected for your game ⛈️',
    'weather.alertTitleWind': 'Strong wind for your game 💨',
    'weather.alertTitleWorse': 'Forecast got worse ☔',
    'weather.alertBodyRain': '{pop} chance of rain at {time}, {place}',
    'weather.alertBodyWind': 'Wind {wind} at {time}, {place}',
    'weather.alertOrganizerHint': 'Move indoor, change the time, or keep it as planned.',
    'weather.alertParticipantHint': 'Check the forecast before you set off.',
    'weather.actionMoveIndoor': 'Move indoor',
    'weather.actionKeepAsPlanned': 'Keep as planned',
    'weather.actionViewForecast': 'View forecast',
    'weather.keptAsPlanned': 'Playing rain or shine',
    'weather.keepFailed': 'That game is no longer open',
    'weather.outdoorCourt': 'outdoor',
  },
  ru: {
    'weather.alertTitleRain': 'На вашу игру вероятен дождь ☔',
    'weather.alertTitleHeavy': 'На вашу игру ожидается сильный дождь ☔',
    'weather.alertTitleStorm': 'На вашу игру ожидается гроза ⛈️',
    'weather.alertTitleWind': 'На вашу игру ожидается сильный ветер 💨',
    'weather.alertTitleWorse': 'Прогноз ухудшился ☔',
    'weather.alertBodyRain': 'Вероятность дождя {pop} в {time}, {place}',
    'weather.alertBodyWind': 'Ветер {wind} в {time}, {place}',
    'weather.alertOrganizerHint': 'Перенесите в зал, измените время или оставьте как есть.',
    'weather.alertParticipantHint': 'Посмотрите прогноз перед выходом.',
    'weather.actionMoveIndoor': 'Перенести в зал',
    'weather.actionKeepAsPlanned': 'Оставить как есть',
    'weather.actionViewForecast': 'Смотреть прогноз',
    'weather.keptAsPlanned': 'Играем в любую погоду',
    'weather.keepFailed': 'Эта игра больше не открыта',
    'weather.outdoorCourt': 'открытый',
  },
  sr: {
    'weather.alertTitleRain': 'Verovatna kiša na vašoj igri ☔',
    'weather.alertTitleHeavy': 'Očekuje se jaka kiša na vašoj igri ☔',
    'weather.alertTitleStorm': 'Očekuje se oluja na vašoj igri ⛈️',
    'weather.alertTitleWind': 'Jak vetar na vašoj igri 💨',
    'weather.alertTitleWorse': 'Prognoza se pogoršala ☔',
    'weather.alertBodyRain': 'Verovatnoća kiše {pop} u {time}, {place}',
    'weather.alertBodyWind': 'Vetar {wind} u {time}, {place}',
    'weather.alertOrganizerHint': 'Pređite u salu, promenite vreme ili ostavite kako jeste.',
    'weather.alertParticipantHint': 'Proverite prognozu pre polaska.',
    'weather.actionMoveIndoor': 'Pređi u salu',
    'weather.actionKeepAsPlanned': 'Ostavi kako jeste',
    'weather.actionViewForecast': 'Pogledaj prognozu',
    'weather.keptAsPlanned': 'Igramo po svakom vremenu',
    'weather.keepFailed': 'Ta igra više nije otvorena',
    'weather.outdoorCourt': 'otvoren',
  },
  es: {
    'weather.alertTitleRain': 'Es probable que llueva en tu partido ☔',
    'weather.alertTitleHeavy': 'Se espera lluvia fuerte en tu partido ☔',
    'weather.alertTitleStorm': 'Se espera tormenta en tu partido ⛈️',
    'weather.alertTitleWind': 'Viento fuerte en tu partido 💨',
    'weather.alertTitleWorse': 'El pronóstico ha empeorado ☔',
    'weather.alertBodyRain': '{pop} de probabilidad de lluvia a las {time}, {place}',
    'weather.alertBodyWind': 'Viento de {wind} a las {time}, {place}',
    'weather.alertOrganizerHint': 'Pasa a pista cubierta, cambia la hora o déjalo como está.',
    'weather.alertParticipantHint': 'Mira el pronóstico antes de salir.',
    'weather.actionMoveIndoor': 'Pasar a cubierta',
    'weather.actionKeepAsPlanned': 'Dejarlo como está',
    'weather.actionViewForecast': 'Ver pronóstico',
    'weather.keptAsPlanned': 'Jugamos llueva o no',
    'weather.keepFailed': 'Ese partido ya no está abierto',
    'weather.outdoorCourt': 'descubierta',
  },
  cs: {
    'weather.alertTitleRain': 'Na vaši hru se čeká déšť ☔',
    'weather.alertTitleHeavy': 'Na vaši hru se čeká silný déšť ☔',
    'weather.alertTitleStorm': 'Na vaši hru se čeká bouřka ⛈️',
    'weather.alertTitleWind': 'Na vaši hru se čeká silný vítr 💨',
    'weather.alertTitleWorse': 'Předpověď se zhoršila ☔',
    'weather.alertBodyRain': 'Pravděpodobnost deště {pop} v {time}, {place}',
    'weather.alertBodyWind': 'Vítr {wind} v {time}, {place}',
    'weather.alertOrganizerHint': 'Přesuňte se do haly, změňte čas, nebo nechte vše beze změny.',
    'weather.alertParticipantHint': 'Před odjezdem se podívejte na předpověď.',
    'weather.actionMoveIndoor': 'Přesunout do haly',
    'weather.actionKeepAsPlanned': 'Nechat beze změny',
    'weather.actionViewForecast': 'Zobrazit předpověď',
    'weather.keptAsPlanned': 'Hrajeme za každého počasí',
    'weather.keepFailed': 'Tato hra už není otevřená',
    'weather.outdoorCourt': 'venkovní',
  },
  ar: {
    'weather.alertTitleRain': 'يُتوقع هطول المطر على مباراتك ☔',
    'weather.alertTitleHeavy': 'يُتوقع مطر غزير على مباراتك ☔',
    'weather.alertTitleStorm': 'تُتوقع عاصفة على مباراتك ⛈️',
    'weather.alertTitleWind': 'رياح قوية على مباراتك 💨',
    'weather.alertTitleWorse': 'ساءت حالة الطقس المتوقعة ☔',
    'weather.alertBodyRain': 'احتمال هطول المطر {pop} عند {time}، {place}',
    'weather.alertBodyWind': 'رياح {wind} عند {time}، {place}',
    'weather.alertOrganizerHint': 'انتقل إلى ملعب مغلق، أو غيّر الوقت، أو أبقِ الموعد كما هو.',
    'weather.alertParticipantHint': 'اطّلع على حالة الطقس قبل خروجك.',
    'weather.actionMoveIndoor': 'الانتقال إلى ملعب مغلق',
    'weather.actionKeepAsPlanned': 'الإبقاء كما هو',
    'weather.actionViewForecast': 'عرض حالة الطقس',
    'weather.keptAsPlanned': 'نلعب مهما كان الطقس',
    'weather.keepFailed': 'لم تعد هذه المباراة مفتوحة',
    'weather.outdoorCourt': 'مكشوف',
  },
  zh: {
    'weather.alertTitleRain': '你的球局可能有雨 ☔',
    'weather.alertTitleHeavy': '你的球局预计有大雨 ☔',
    'weather.alertTitleStorm': '你的球局预计有雷暴 ⛈️',
    'weather.alertTitleWind': '你的球局预计有大风 💨',
    'weather.alertTitleWorse': '天气预报变差了 ☔',
    'weather.alertBodyRain': '{time} 降雨概率 {pop}，{place}',
    'weather.alertBodyWind': '{time} 风力 {wind}，{place}',
    'weather.alertOrganizerHint': '可以改到室内场、改时间，或按原计划进行。',
    'weather.alertParticipantHint': '出发前先看一下天气。',
    'weather.actionMoveIndoor': '改到室内场',
    'weather.actionKeepAsPlanned': '按原计划',
    'weather.actionViewForecast': '查看天气',
    'weather.keptAsPlanned': '风雨无阻照常打',
    'weather.keepFailed': '该球局已不再开放',
    'weather.outdoorCourt': '室外',
  },
  id: {
    'weather.alertTitleRain': 'Kemungkinan hujan saat permainanmu ☔',
    'weather.alertTitleHeavy': 'Diperkirakan hujan deras saat permainanmu ☔',
    'weather.alertTitleStorm': 'Diperkirakan badai saat permainanmu ⛈️',
    'weather.alertTitleWind': 'Angin kencang saat permainanmu 💨',
    'weather.alertTitleWorse': 'Prakiraan cuaca memburuk ☔',
    'weather.alertBodyRain': 'Peluang hujan {pop} pukul {time}, {place}',
    'weather.alertBodyWind': 'Angin {wind} pukul {time}, {place}',
    'weather.alertOrganizerHint': 'Pindah ke lapangan indoor, ubah waktunya, atau tetap sesuai rencana.',
    'weather.alertParticipantHint': 'Cek prakiraan cuaca sebelum berangkat.',
    'weather.actionMoveIndoor': 'Pindah ke indoor',
    'weather.actionKeepAsPlanned': 'Tetap sesuai rencana',
    'weather.actionViewForecast': 'Lihat prakiraan',
    'weather.keptAsPlanned': 'Main apa pun cuacanya',
    'weather.keepFailed': 'Permainan itu sudah tidak terbuka',
    'weather.outdoorCourt': 'outdoor',
  },
  hi: {
    'weather.alertTitleRain': 'आपके गेम पर बारिश की संभावना है ☔',
    'weather.alertTitleHeavy': 'आपके गेम पर तेज़ बारिश का अनुमान है ☔',
    'weather.alertTitleStorm': 'आपके गेम पर तूफ़ान का अनुमान है ⛈️',
    'weather.alertTitleWind': 'आपके गेम पर तेज़ हवा चलेगी 💨',
    'weather.alertTitleWorse': 'मौसम का अनुमान बिगड़ गया ☔',
    'weather.alertBodyRain': '{time} बजे बारिश की संभावना {pop}, {place}',
    'weather.alertBodyWind': '{time} बजे हवा {wind}, {place}',
    'weather.alertOrganizerHint': 'इनडोर कोर्ट पर ले जाएँ, समय बदलें, या जैसा तय है वैसा ही रखें।',
    'weather.alertParticipantHint': 'निकलने से पहले मौसम देख लें।',
    'weather.actionMoveIndoor': 'इनडोर ले जाएँ',
    'weather.actionKeepAsPlanned': 'जैसा है वैसा रखें',
    'weather.actionViewForecast': 'मौसम देखें',
    'weather.keptAsPlanned': 'मौसम कैसा भी हो, खेलेंगे',
    'weather.keepFailed': 'यह गेम अब खुला नहीं है',
    'weather.outdoorCourt': 'खुला',
  },
  th: {
    'weather.alertTitleRain': 'เกมของคุณมีแนวโน้มฝนตก ☔',
    'weather.alertTitleHeavy': 'เกมของคุณคาดว่าจะมีฝนตกหนัก ☔',
    'weather.alertTitleStorm': 'เกมของคุณคาดว่าจะมีพายุ ⛈️',
    'weather.alertTitleWind': 'เกมของคุณจะมีลมแรง 💨',
    'weather.alertTitleWorse': 'พยากรณ์อากาศแย่ลง ☔',
    'weather.alertBodyRain': 'โอกาสฝนตก {pop} เวลา {time}, {place}',
    'weather.alertBodyWind': 'ลม {wind} เวลา {time}, {place}',
    'weather.alertOrganizerHint': 'ย้ายเข้าคอร์ตในร่ม เปลี่ยนเวลา หรือเล่นตามแผนเดิม',
    'weather.alertParticipantHint': 'ดูพยากรณ์อากาศก่อนออกเดินทาง',
    'weather.actionMoveIndoor': 'ย้ายเข้าในร่ม',
    'weather.actionKeepAsPlanned': 'เล่นตามแผนเดิม',
    'weather.actionViewForecast': 'ดูพยากรณ์อากาศ',
    'weather.keptAsPlanned': 'เล่นไม่ว่าฝนจะตกหรือไม่',
    'weather.keepFailed': 'เกมนี้ไม่เปิดแล้ว',
    'weather.outdoorCourt': 'กลางแจ้ง',
  },
  ja: {
    'weather.alertTitleRain': '試合の時間に雨の予報です ☔',
    'weather.alertTitleHeavy': '試合の時間に強い雨の予報です ☔',
    'weather.alertTitleStorm': '試合の時間に雷雨の予報です ⛈️',
    'weather.alertTitleWind': '試合の時間に強風の予報です 💨',
    'weather.alertTitleWorse': '天気予報が悪化しました ☔',
    'weather.alertBodyRain': '{time}の降水確率は{pop}、{place}',
    'weather.alertBodyWind': '{time}の風速は{wind}、{place}',
    'weather.alertOrganizerHint': '屋内コートへの変更、時間の変更、このまま開催のいずれかを選べます。',
    'weather.alertParticipantHint': '出発前に天気を確認してください。',
    'weather.actionMoveIndoor': '屋内に変更',
    'weather.actionKeepAsPlanned': 'このまま開催',
    'weather.actionViewForecast': '天気を見る',
    'weather.keptAsPlanned': '雨でも晴れでも開催',
    'weather.keepFailed': 'このゲームはもう受け付けていません',
    'weather.outdoorCourt': '屋外',
  },
};

/** `t(key, lang)` for the weather-alert namespace. Unknown language → `en`. */
export function weatherT(
  key: WeatherCopyKey,
  language: string | null | undefined,
  params: Record<string, string> = {},
): string {
  const lang = language && WEATHER_COPY[language] ? language : 'en';
  const template = WEATHER_COPY[lang][key] ?? WEATHER_COPY.en[key] ?? key;
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(value),
    template,
  );
}

export const WEATHER_COPY_LANGUAGES = Object.keys(WEATHER_COPY);

function safeLocale(language: string | null | undefined): string {
  return language && WEATHER_COPY[language] ? language : 'en';
}

/** `70` → the locale's rendering of 70 %. Never a hard-coded `%`. */
export function formatPercent(value: number, language: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(safeLocale(language), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(Math.max(0, Math.min(100, Math.round(value))) / 100);
  } catch {
    return `${Math.round(value)}%`;
  }
}

/** `42` → the locale's rendering of 42 km/h. Never a hard-coded suffix. */
export function formatWindSpeed(value: number, language: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(safeLocale(language), {
      style: 'unit',
      unit: 'kilometer-per-hour',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  } catch {
    return `${Math.round(value)} km/h`;
  }
}

/** Clock time in the club's timezone, formatted for the recipient's locale. */
export function formatClockTime(
  isoTime: string,
  language: string | null | undefined,
  timeZone?: string | null,
): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(safeLocale(language), {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}
