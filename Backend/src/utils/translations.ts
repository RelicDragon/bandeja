import { format, Locale } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { ru } from 'date-fns/locale/ru';
import { sr } from 'date-fns/locale/sr';
import { es } from 'date-fns/locale/es';

const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru,
  sr: sr,
  es: es,
};

const translations: Record<string, Record<string, string>> = {
  en: {
    'createGame.today': 'Today',
    'createGame.tomorrow': 'Tomorrow',
    'createGame.yesterday': 'Yesterday',
    'common.h': 'h',
    'common.m': 'm',
    'games.entityTypes.GAME': 'Game',
    'games.entityTypes.BAR': 'Bar',
    'games.entityTypes.TRAINING': 'Training',
    'games.entityTypes.TOURNAMENT': 'Tournament',
    'games.entityTypes.LEAGUE': 'League',
    'games.gameTypes.CLASSIC': 'Classic',
    'games.gameTypes.AMERICANO': 'Americano',
    'games.gameTypes.MEXICANO': 'Mexicano',
    'games.gameTypes.ROUND_ROBIN': 'Round Robin',
    'games.gameTypes.WINNER_COURT': 'Winner Court',
    'games.status.announced': 'Announced',
    'games.status.ready': 'Ready',
    'games.status.started': 'Started',
    'games.status.finished': 'Finished',
    'games.status.archived': 'Archived',
    'games.organizer': 'Organizer',
    'games.noRating': 'Non-Rating',
    'games.fixedTeams': 'Fixed Teams',
    'games.participants': 'Participants',
    'games.level': 'Level',
    'createGame.notBookedYet': 'Not booked yet',
    'createGame.hasBookedCourt': 'Court booked',
    'createGame.hasBookedHall': 'Hall booked',
    'telegram.viewGame': 'View Game',
    'telegram.showGame': 'Show Game',
    'telegram.reply': 'Reply',
    'telegram.replyPrompt': 'Please send your reply message:',
    'telegram.replyCancelled': 'Reply cancelled',
    'telegram.replySent': 'Reply sent successfully',
  },
  ru: {
    'createGame.today': 'Сегодня',
    'createGame.tomorrow': 'Завтра',
    'createGame.yesterday': 'Вчера',
    'common.h': 'ч',
    'common.m': 'м',
    'games.entityTypes.GAME': 'Игра',
    'games.entityTypes.BAR': 'Бар',
    'games.entityTypes.TRAINING': 'Тренировка',
    'games.entityTypes.TOURNAMENT': 'Турнир',
    'games.entityTypes.LEAGUE': 'Лига',
    'games.gameTypes.CLASSIC': 'Классика',
    'games.gameTypes.AMERICANO': 'Американо',
    'games.gameTypes.MEXICANO': 'Мексикано',
    'games.gameTypes.ROUND_ROBIN': 'Круговой',
    'games.gameTypes.WINNER_COURT': 'Победитель корта',
    'games.status.announced': 'Объявлена',
    'games.status.ready': 'Готова',
    'games.status.started': 'Началась',
    'games.status.finished': 'Завершена',
    'games.status.archived': 'Архивирована',
    'games.organizer': 'Организатор',
    'games.noRating': 'Без рейтинга',
    'games.fixedTeams': 'Фиксированные команды',
    'games.participants': 'Участники',
    'games.level': 'Уровень',
    'createGame.notBookedYet': 'Еще не забронировано',
    'createGame.hasBookedCourt': 'Корт забронирован',
    'createGame.hasBookedHall': 'Зал забронирован',
    'telegram.viewGame': 'Посмотреть игру',
    'telegram.showGame': 'Показать игру',
    'telegram.reply': 'Ответить',
    'telegram.replyPrompt': 'Пожалуйста, отправьте ваше сообщение-ответ:',
    'telegram.replyCancelled': 'Ответ отменен',
    'telegram.replySent': 'Ответ успешно отправлен',
  },
  sr: {
    'createGame.today': 'Данас',
    'createGame.tomorrow': 'Сутра',
    'createGame.yesterday': 'Јуче',
    'common.h': 'ч',
    'common.m': 'м',
    'games.entityTypes.GAME': 'Игра',
    'games.entityTypes.BAR': 'Бар',
    'games.entityTypes.TRAINING': 'Тренинг',
    'games.entityTypes.TOURNAMENT': 'Турнир',
    'games.entityTypes.LEAGUE': 'Лига',
    'games.gameTypes.CLASSIC': 'Класик',
    'games.gameTypes.AMERICANO': 'Американо',
    'games.gameTypes.MEXICANO': 'Мексикано',
    'games.gameTypes.ROUND_ROBIN': 'Роund Робин',
    'games.gameTypes.WINNER_COURT': 'Победник терена',
    'games.status.announced': 'Најављено',
    'games.status.ready': 'Спремно',
    'games.status.started': 'Почело',
    'games.status.finished': 'Завршено',
    'games.status.archived': 'Архивирано',
    'games.organizer': 'Организатор',
    'games.noRating': 'Без рејтинга',
    'games.fixedTeams': 'Фиксни тимови',
    'games.participants': 'Учесници',
    'games.level': 'Ниво',
    'createGame.notBookedYet': 'Још није резервисано',
    'createGame.hasBookedCourt': 'Терен резервисан',
    'createGame.hasBookedHall': 'Сала резервисана',
    'telegram.viewGame': 'Погледај игру',
    'telegram.showGame': 'Прикажи игру',
    'telegram.reply': 'Одговори',
    'telegram.replyPrompt': 'Молимо пошаљите вашу поруку-одговор:',
    'telegram.replyCancelled': 'Одговор отказан',
    'telegram.replySent': 'Одговор успешно послат',
  },
  es: {
    'createGame.today': 'Hoy',
    'createGame.tomorrow': 'Mañana',
    'createGame.yesterday': 'Ayer',
    'common.h': 'h',
    'common.m': 'm',
    'games.entityTypes.GAME': 'Juego',
    'games.entityTypes.BAR': 'Bar',
    'games.entityTypes.TRAINING': 'Entrenamiento',
    'games.entityTypes.TOURNAMENT': 'Torneo',
    'games.entityTypes.LEAGUE': 'Liga',
    'games.gameTypes.CLASSIC': 'Clásico',
    'games.gameTypes.AMERICANO': 'Americano',
    'games.gameTypes.MEXICANO': 'Mexicano',
    'games.gameTypes.ROUND_ROBIN': 'Round Robin',
    'games.gameTypes.WINNER_COURT': 'Ganador de la pista',
    'games.status.announced': 'Anunciado',
    'games.status.ready': 'Listo',
    'games.status.started': 'Iniciado',
    'games.status.finished': 'Finalizado',
    'games.status.archived': 'Archivado',
    'games.organizer': 'Organizador',
    'games.noRating': 'Sin clasificación',
    'games.fixedTeams': 'Equipos fijos',
    'games.participants': 'Participantes',
    'games.level': 'Nivel',
    'createGame.notBookedYet': 'Aún no reservado',
    'createGame.hasBookedCourt': 'Pista reservada',
    'createGame.hasBookedHall': 'Salón reservado',
    'telegram.viewGame': 'Ver juego',
    'telegram.showGame': 'Mostrar juego',
    'telegram.reply': 'Responder',
    'telegram.replyPrompt': 'Por favor, envía tu mensaje de respuesta:',
    'telegram.replyCancelled': 'Respuesta cancelada',
    'telegram.replySent': 'Respuesta enviada exitosamente',
  },
};

export const t = (key: string, lang: string = 'en'): string => {
  return translations[lang]?.[key] || translations.en[key] || key;
};

export const formatDate = (date: Date | string, formatStr: string, lang: string = 'en'): string => {
  const locale = localeMap[lang] || enUS;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, formatStr, { locale });
};

export const getDateLabel = (date: Date | string, lang: string = 'en', includeComma: boolean = true): string => {
  const gameDate = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const gameDateOnly = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (gameDateOnly.getTime() === todayOnly.getTime()) {
    return t('createGame.today', lang);
  } else if (gameDateOnly.getTime() === tomorrowOnly.getTime()) {
    return t('createGame.tomorrow', lang);
  } else if (gameDateOnly.getTime() === yesterdayOnly.getTime()) {
    return t('createGame.yesterday', lang);
  } else {
    return formatDate(gameDate, 'MMM d', lang) + (includeComma ? ',' : '');
  }
};

