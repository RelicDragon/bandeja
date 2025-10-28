import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MainLayout } from '@/layouts/MainLayout';
import { Card } from '@/components';
import { chatApi } from '@/api/chat';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { MessageCircle, Calendar, MapPin, Users } from 'lucide-react';

export const ChatList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChatGames = async () => {
      try {
        const response = await chatApi.getUserChatGames();
        setGames(response.data);
      } catch (error) {
        console.error('Failed to fetch chat games:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChatGames();
  }, []);

  const getGameTitle = (game: Game) => {
    if (game.name) return game.name;
    if (game.court?.club) return `${game.court.club.name} - ${game.gameType}`;
    return `${game.gameType} Game`;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-gray-200 dark:bg-gray-700 h-24 rounded-lg"></div>
            </div>
          ))}
        </div>
      </MainLayout>
    );
  }

  if (games.length === 0) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <MessageCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {t('chat.noChats')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('chat.noChatsDescription')}
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('chat.title')}
        </h1>
        
        {games.map((game) => (
          <Card
            key={game.id}
            className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(`/games/${game.id}/chat`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {getGameTitle(game)}
                </h3>
                
                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} />
                    <span>{formatDate(game.startTime, 'PPP')}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin size={16} />
                    <span>
                      {game.court?.club?.name}
                      {game.court?.club?.city && `, ${game.court.club.city.name}`}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    <span>
                      {game.participants.length}/{game.maxParticipants} {t('game.participants')}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-4">
                <MessageCircle size={20} className="text-gray-400" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </MainLayout>
  );
};
