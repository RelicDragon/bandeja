import ads from './ads.json';
import app from './app.json';
import auth from './auth.json';
import bets from './bets.json';
import bottomTab from './bottomTab.json';
import bug from './bug.json';
import calendar from './calendar.json';
import chat from './chat.json';
import chats from './chats.json';
import city from './city.json';
import club from './club.json';
import clubAdmin from './clubAdmin.json';
import common from './common.json';
import conflicts from './conflicts.json';
import contacts from './contacts.json';
import createGame from './createGame.json';
import createLeague from './createLeague.json';
import errors from './errors.json';
import faq from './faq.json';
import favorites from './favorites.json';
import gameDetails from './gameDetails.json';
import gameFormat from './gameFormat.json';
import gameResults from './gameResults.json';
import gameSubscriptions from './gameSubscriptions.json';
import games from './games.json';
import healthWorkout from './healthWorkout.json';
import home from './home.json';
import invites from './invites.json';
import marketplace from './marketplace.json';
import media from './media.json';
import nav from './nav.json';
import offline from './offline.json';
import permissions from './permissions.json';
import playerCard from './playerCard.json';
import playerInvite from './playerInvite.json';
import playerProfile from './playerProfile.json';
import profile from './profile.json';
import push from './push.json';
import rating from './rating.json';
import sportRating from './sportRating.json';
import teams from './teams.json';
import telegram from './telegram.json';
import trainers from './trainers.json';
import training from './training.json';
import userGameNotes from './userGameNotes.json';
import wallet from './wallet.json';
import welcome from './welcome.json';
import weather from './weather.json';
import stories from './stories.json';
import sportQuestionnaireCommon from './sportQuestionnaire/common.json';
import sportQuestionnairePadel from './sportQuestionnaire/padel.json';
import sportQuestionnaireTennis from './sportQuestionnaire/tennis.json';
import sportQuestionnairePickleball from './sportQuestionnaire/pickleball.json';
import sportQuestionnaireBadminton from './sportQuestionnaire/badminton.json';
import sportQuestionnaireTableTennis from './sportQuestionnaire/tableTennis.json';
import sportQuestionnaireSquash from './sportQuestionnaire/squash.json';

export default {
    ...ads,
    ...app,
    ...auth,
    ...bets,
    ...bottomTab,
    ...bug,
    ...calendar,
    ...chat,
    ...chats,
    ...city,
    ...club,
    ...clubAdmin,
    ...common,
    ...conflicts,
    ...contacts,
    ...createGame,
    ...createLeague,
    ...errors,
    ...faq,
    ...favorites,
    ...gameDetails,
    ...gameFormat,
    ...gameResults,
    ...gameSubscriptions,
    ...games,
    ...healthWorkout,
    ...home,
    ...invites,
    ...marketplace,
    ...media,
    ...nav,
    ...offline,
    ...permissions,
    ...playerCard,
    ...playerInvite,
    ...playerProfile,
    ...profile,
    ...push,
    ...rating,
    ...sportRating,
    ...teams,
    ...telegram,
    ...trainers,
    ...training,
    ...userGameNotes,
    ...wallet,
    ...welcome,
    ...weather,
    ...stories,
    sportQuestionnaire: {
        common: sportQuestionnaireCommon,
        padel: sportQuestionnairePadel,
        tennis: sportQuestionnaireTennis,
        pickleball: sportQuestionnairePickleball,
        badminton: sportQuestionnaireBadminton,
        tableTennis: sportQuestionnaireTableTennis,
        squash: sportQuestionnaireSquash,
    },
};
