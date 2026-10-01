/**
 * UI strings of `web_search` / `web_fetch` (Phase 13), in the 11 app languages. English is
 * the fallback. `sr` is Serbian Latin. What the model sees stays English (tool data).
 */
import { agentLang } from './agentI18n';

export const AGENT_WEB_I18N_EN = {
  'label.webSearch': 'Searching the web: “{{query}}”',
  'label.webSearchAny': 'Searching the web',
  'label.webFetch': 'Reading {{host}}',
  'label.webFetchAny': 'Reading a web page',
  'summary.searchResults': 'Web results: {{count}}',
  'summary.searchNone': 'No web results',
  'summary.searchUnavailable': 'Web search is unavailable right now',
  'summary.fetched': 'Read {{host}}',
  'summary.fetchFailed': "Couldn't read {{host}}",
  'summary.urlNotAllowed': 'Only links from a web search or from you can be opened',
  'summary.queryRejected': "Search words can't include personal data",
  'summary.runLimit': 'Web limit for this answer reached',
  'summary.dailyLimit': 'Daily web limit reached',
  'summary.budget': 'Daily AI assistant limit reached',
  'summary.busy': 'Web search is busy, try again in a minute',
} as const;

export type AgentWebI18nKey = keyof typeof AGENT_WEB_I18N_EN;
type Dictionary = Partial<Record<AgentWebI18nKey, string>>;

const ru: Dictionary = {
  'label.webSearch': 'Ищу в интернете: «{{query}}»',
  'label.webSearchAny': 'Ищу в интернете',
  'label.webFetch': 'Читаю {{host}}',
  'label.webFetchAny': 'Читаю веб-страницу',
  'summary.searchResults': 'Результаты из интернета: {{count}}',
  'summary.searchNone': 'В интернете ничего не нашлось',
  'summary.searchUnavailable': 'Поиск в интернете сейчас недоступен',
  'summary.fetched': 'Прочитано: {{host}}',
  'summary.fetchFailed': 'Не удалось открыть {{host}}',
  'summary.urlNotAllowed': 'Открывать можно только ссылки из поиска или от вас',
  'summary.queryRejected': 'В поисковом запросе не может быть личных данных',
  'summary.runLimit': 'Лимит поиска для этого ответа исчерпан',
  'summary.dailyLimit': 'Дневной лимит поиска исчерпан',
  'summary.budget': 'Дневной лимит ИИ-ассистента исчерпан',
  'summary.busy': 'Поиск перегружен, попробуйте через минуту',
};

const sr: Dictionary = {
  'label.webSearch': 'Pretražujem internet: „{{query}}”',
  'label.webSearchAny': 'Pretražujem internet',
  'label.webFetch': 'Čitam {{host}}',
  'label.webFetchAny': 'Čitam veb-stranicu',
  'summary.searchResults': 'Rezultati sa interneta: {{count}}',
  'summary.searchNone': 'Nema rezultata na internetu',
  'summary.searchUnavailable': 'Pretraga interneta trenutno nije dostupna',
  'summary.fetched': 'Pročitano: {{host}}',
  'summary.fetchFailed': 'Nije moguće otvoriti {{host}}',
  'summary.urlNotAllowed': 'Mogu se otvoriti samo linkovi iz pretrage ili od vas',
  'summary.queryRejected': 'Pretraga ne sme da sadrži lične podatke',
  'summary.runLimit': 'Dostignut je limit pretrage za ovaj odgovor',
  'summary.dailyLimit': 'Dostignut je dnevni limit pretrage',
  'summary.budget': 'Dostignut je dnevni limit AI asistenta',
  'summary.busy': 'Pretraga je zauzeta, pokušajte za minut',
};

const es: Dictionary = {
  'label.webSearch': 'Buscando en la web: «{{query}}»',
  'label.webSearchAny': 'Buscando en la web',
  'label.webFetch': 'Leyendo {{host}}',
  'label.webFetchAny': 'Leyendo una página web',
  'summary.searchResults': 'Resultados de la web: {{count}}',
  'summary.searchNone': 'Sin resultados en la web',
  'summary.searchUnavailable': 'La búsqueda web no está disponible ahora',
  'summary.fetched': 'Leído: {{host}}',
  'summary.fetchFailed': 'No se pudo leer {{host}}',
  'summary.urlNotAllowed': 'Solo se pueden abrir enlaces de una búsqueda o que tú enviaste',
  'summary.queryRejected': 'La búsqueda no puede incluir datos personales',
  'summary.runLimit': 'Se alcanzó el límite web de esta respuesta',
  'summary.dailyLimit': 'Se alcanzó el límite web diario',
  'summary.budget': 'Se alcanzó el límite diario del asistente de IA',
  'summary.busy': 'La búsqueda web está ocupada, inténtalo en un minuto',
};

const cs: Dictionary = {
  'label.webSearch': 'Hledám na webu: „{{query}}“',
  'label.webSearchAny': 'Hledám na webu',
  'label.webFetch': 'Čtu {{host}}',
  'label.webFetchAny': 'Čtu webovou stránku',
  'summary.searchResults': 'Výsledky z webu: {{count}}',
  'summary.searchNone': 'Na webu nic nenalezeno',
  'summary.searchUnavailable': 'Vyhledávání na webu teď není dostupné',
  'summary.fetched': 'Přečteno: {{host}}',
  'summary.fetchFailed': '{{host}} se nepodařilo otevřít',
  'summary.urlNotAllowed': 'Otevřít lze jen odkazy z vyhledávání nebo od vás',
  'summary.queryRejected': 'Hledaný výraz nesmí obsahovat osobní údaje',
  'summary.runLimit': 'Limit webu pro tuto odpověď je vyčerpán',
  'summary.dailyLimit': 'Denní limit webu je vyčerpán',
  'summary.budget': 'Denní limit AI asistenta je vyčerpán',
  'summary.busy': 'Vyhledávání je přetížené, zkuste to za minutu',
};

const ar: Dictionary = {
  'label.webSearch': 'جارٍ البحث في الويب: «{{query}}»',
  'label.webSearchAny': 'جارٍ البحث في الويب',
  'label.webFetch': 'جارٍ قراءة {{host}}',
  'label.webFetchAny': 'جارٍ قراءة صفحة ويب',
  'summary.searchResults': 'نتائج من الويب: {{count}}',
  'summary.searchNone': 'لا توجد نتائج على الويب',
  'summary.searchUnavailable': 'البحث في الويب غير متاح الآن',
  'summary.fetched': 'تمت قراءة {{host}}',
  'summary.fetchFailed': 'تعذّرت قراءة {{host}}',
  'summary.urlNotAllowed': 'يمكن فتح الروابط من البحث أو التي أرسلتها أنت فقط',
  'summary.queryRejected': 'لا يمكن أن يتضمن البحث بيانات شخصية',
  'summary.runLimit': 'تم بلوغ حد الويب لهذه الإجابة',
  'summary.dailyLimit': 'تم بلوغ حد الويب اليومي',
  'summary.budget': 'تم بلوغ الحد اليومي لمساعد الذكاء الاصطناعي',
  'summary.busy': 'البحث في الويب مشغول، حاول بعد دقيقة',
};

const zh: Dictionary = {
  'label.webSearch': '正在网上搜索：“{{query}}”',
  'label.webSearchAny': '正在网上搜索',
  'label.webFetch': '正在阅读 {{host}}',
  'label.webFetchAny': '正在阅读网页',
  'summary.searchResults': '网络结果：{{count}}',
  'summary.searchNone': '网上没有结果',
  'summary.searchUnavailable': '网络搜索暂时不可用',
  'summary.fetched': '已阅读 {{host}}',
  'summary.fetchFailed': '无法读取 {{host}}',
  'summary.urlNotAllowed': '只能打开搜索结果或你发送的链接',
  'summary.queryRejected': '搜索词不能包含个人信息',
  'summary.runLimit': '本次回答的网络次数已用完',
  'summary.dailyLimit': '今日网络次数已用完',
  'summary.budget': '今日 AI 助手额度已用完',
  'summary.busy': '网络搜索繁忙，请一分钟后再试',
};

const id: Dictionary = {
  'label.webSearch': 'Mencari di web: “{{query}}”',
  'label.webSearchAny': 'Mencari di web',
  'label.webFetch': 'Membaca {{host}}',
  'label.webFetchAny': 'Membaca halaman web',
  'summary.searchResults': 'Hasil web: {{count}}',
  'summary.searchNone': 'Tidak ada hasil di web',
  'summary.searchUnavailable': 'Pencarian web sedang tidak tersedia',
  'summary.fetched': 'Sudah dibaca: {{host}}',
  'summary.fetchFailed': 'Tidak bisa membaca {{host}}',
  'summary.urlNotAllowed': 'Hanya tautan dari pencarian atau dari Anda yang bisa dibuka',
  'summary.queryRejected': 'Kata pencarian tidak boleh berisi data pribadi',
  'summary.runLimit': 'Batas web untuk jawaban ini tercapai',
  'summary.dailyLimit': 'Batas web harian tercapai',
  'summary.budget': 'Batas harian asisten AI tercapai',
  'summary.busy': 'Pencarian web sedang sibuk, coba lagi dalam semenit',
};

const hi: Dictionary = {
  'label.webSearch': 'वेब पर खोज रहा हूँ: “{{query}}”',
  'label.webSearchAny': 'वेब पर खोज रहा हूँ',
  'label.webFetch': '{{host}} पढ़ रहा हूँ',
  'label.webFetchAny': 'वेब पेज पढ़ रहा हूँ',
  'summary.searchResults': 'वेब परिणाम: {{count}}',
  'summary.searchNone': 'वेब पर कोई परिणाम नहीं',
  'summary.searchUnavailable': 'वेब खोज अभी उपलब्ध नहीं है',
  'summary.fetched': '{{host}} पढ़ लिया',
  'summary.fetchFailed': '{{host}} नहीं पढ़ सका',
  'summary.urlNotAllowed': 'केवल खोज से मिले या आपके भेजे लिंक ही खोले जा सकते हैं',
  'summary.queryRejected': 'खोज शब्दों में निजी जानकारी नहीं हो सकती',
  'summary.runLimit': 'इस जवाब के लिए वेब सीमा पूरी हो गई',
  'summary.dailyLimit': 'आज की वेब सीमा पूरी हो गई',
  'summary.budget': 'AI सहायक की आज की सीमा पूरी हो गई',
  'summary.busy': 'वेब खोज व्यस्त है, एक मिनट बाद फिर कोशिश करें',
};

const th: Dictionary = {
  'label.webSearch': 'กำลังค้นหาบนเว็บ: “{{query}}”',
  'label.webSearchAny': 'กำลังค้นหาบนเว็บ',
  'label.webFetch': 'กำลังอ่าน {{host}}',
  'label.webFetchAny': 'กำลังอ่านหน้าเว็บ',
  'summary.searchResults': 'ผลลัพธ์จากเว็บ: {{count}}',
  'summary.searchNone': 'ไม่พบผลลัพธ์บนเว็บ',
  'summary.searchUnavailable': 'การค้นหาเว็บไม่พร้อมใช้งานในขณะนี้',
  'summary.fetched': 'อ่าน {{host}} แล้ว',
  'summary.fetchFailed': 'ไม่สามารถอ่าน {{host}} ได้',
  'summary.urlNotAllowed': 'เปิดได้เฉพาะลิงก์จากการค้นหาหรือที่คุณส่งมาเท่านั้น',
  'summary.queryRejected': 'คำค้นหาต้องไม่มีข้อมูลส่วนตัว',
  'summary.runLimit': 'ถึงขีดจำกัดเว็บสำหรับคำตอบนี้แล้ว',
  'summary.dailyLimit': 'ถึงขีดจำกัดเว็บรายวันแล้ว',
  'summary.budget': 'ถึงขีดจำกัดรายวันของผู้ช่วย AI แล้ว',
  'summary.busy': 'การค้นหาเว็บไม่ว่าง ลองใหม่ในอีกหนึ่งนาที',
};

const ja: Dictionary = {
  'label.webSearch': 'ウェブで検索中:「{{query}}」',
  'label.webSearchAny': 'ウェブで検索中',
  'label.webFetch': '{{host}} を読んでいます',
  'label.webFetchAny': 'ウェブページを読んでいます',
  'summary.searchResults': 'ウェブの結果:{{count}}件',
  'summary.searchNone': 'ウェブに結果がありません',
  'summary.searchUnavailable': '現在ウェブ検索は利用できません',
  'summary.fetched': '{{host}} を読みました',
  'summary.fetchFailed': '{{host}} を読めませんでした',
  'summary.urlNotAllowed': '開けるのは検索結果またはあなたが送ったリンクだけです',
  'summary.queryRejected': '検索語に個人情報は含められません',
  'summary.runLimit': 'この回答のウェブ上限に達しました',
  'summary.dailyLimit': '本日のウェブ上限に達しました',
  'summary.budget': '本日のAIアシスタント上限に達しました',
  'summary.busy': 'ウェブ検索が混み合っています。1分後にもう一度お試しください',
};

export const AGENT_WEB_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentWebT(
  locale: string | null | undefined,
  key: AgentWebI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_WEB_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_WEB_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
