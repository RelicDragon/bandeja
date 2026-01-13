import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components';
import { LogIn, UserPlus } from 'lucide-react';

export const PublicGamePrompt = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Card className="p-6 mb-4 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 border-primary-200 dark:border-primary-800">
      <div className="text-center space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('games.joinToParticipate', { defaultValue: 'Join to participate!' })}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('games.loginToJoinGame', { defaultValue: 'Login or register to join this game and connect with other players' })}
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => navigate('/login')}
            variant="primary"
            size="md"
            className="flex items-center gap-2"
          >
            <LogIn size={18} />
            {t('auth.login', { defaultValue: 'Login' })}
          </Button>
          <Button
            onClick={() => navigate('/register')}
            variant="outline"
            size="md"
            className="flex items-center gap-2"
          >
            <UserPlus size={18} />
            {t('auth.register', { defaultValue: 'Register' })}
          </Button>
        </div>
      </div>
    </Card>
  );
};
