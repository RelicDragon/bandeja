import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button, LanguageSelector, ThemeSelector } from '@/components';
import { LogIn } from 'lucide-react';

export type PublicGamePromptVariant = 'game' | 'profile';

interface PublicGamePromptProps {
  variant?: PublicGamePromptVariant;
}

export const PublicGamePrompt = ({ variant = 'game' }: PublicGamePromptProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isProfile = variant === 'profile';

  return (
    <div className="relative mb-4">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        <LanguageSelector />
        <ThemeSelector />
      </div>
      <Card className="p-6 bg-gradient-to-br from-primary-50 via-sky-50 to-primary-100 dark:from-primary-900/25 dark:via-sky-900/15 dark:to-primary-800/25 border-primary-200 dark:border-primary-800 shadow-md shadow-primary-500/5">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-600/30">
            <LogIn size={22} />
          </div>
          <h3 className="section-title">
            {isProfile
              ? t('playerProfile.publicPromptTitle', { defaultValue: 'Sign in to see more' })
              : t('games.joinToParticipate', { defaultValue: 'Join to participate!' })}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isProfile
              ? t('playerProfile.publicPromptBody', { defaultValue: 'Login or register to see full statistics, favorites, and chat with this player.' })
              : t('games.loginToJoinGame', { defaultValue: 'Login or register to join this game and connect with other players' })}
          </p>
          <Button
            onClick={() => navigate('/login')}
            variant="primary"
            size="md"
            className="flex items-center gap-2 mx-auto rounded-xl shadow-md shadow-primary-600/25 hover:shadow-lg hover:shadow-primary-600/35 transition-all duration-200"
          >
            <LogIn size={18} />
            {t('auth.login', { defaultValue: 'Login' })}
          </Button>
        </div>
      </Card>
    </div>
  );
};
