import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, Card, Input, Select, ToggleGroup, AvatarUpload, FullscreenImageViewer, LundaAccountModal } from '@/components';
import { ProfileStatistics } from '@/components/ProfileStatistics';
import { ProfileComparison } from '@/components/ProfileComparison';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { usersApi, citiesApi, mediaApi, lundaApi } from '@/api';
import { City, Gender, User } from '@/types';
import { Moon, Sun, Globe, MapPin, Monitor, LogOut, Eye, Beer } from 'lucide-react';
import { UrlConstructor } from '@/utils/urlConstructor';

export const ProfileContent = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState<'general' | 'statistics' | 'comparison'>('general');

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [gender, setGender] = useState<Gender>(user?.gender || 'PREFER_NOT_TO_SAY');
  const [preferredHandLeft, setPreferredHandLeft] = useState(user?.preferredHandLeft || false);
  const [preferredHandRight, setPreferredHandRight] = useState(user?.preferredHandRight || false);
  const [preferredCourtSideLeft, setPreferredCourtSideLeft] = useState(user?.preferredCourtSideLeft || false);
  const [preferredCourtSideRight, setPreferredCourtSideRight] = useState(user?.preferredCourtSideRight || false);
  const [sendTelegramMessages, setSendTelegramMessages] = useState(user?.sendTelegramMessages ?? true);
  const [sendTelegramInvites, setSendTelegramInvites] = useState(user?.sendTelegramInvites ?? true);

  const [cities, setCities] = useState<City[]>([]);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showLundaModal, setShowLundaModal] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [lundaStatus, setLundaStatus] = useState<{
    hasCookie: boolean;
    hasProfile: boolean;
    lastSync: string | null;
  } | null>(null);
  const [isLoadingLundaStatus, setIsLoadingLundaStatus] = useState(true);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    try {
      const response = await usersApi.updateProfile({
        ...updates,
        language: updates.language ?? i18n.language,
      });
      updateUser(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  }, [i18n.language, updateUser, t]);

  const debouncedUpdate = useCallback((updates: Partial<User>) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    updateTimeoutRef.current = setTimeout(() => {
      updateProfile(updates);
    }, 500);
  }, [updateProfile]);

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await citiesApi.getAll();
        setCities(response.data);
      } catch (error) {
        console.error('Failed to fetch cities:', error);
      }
    };

    const fetchUserProfile = async () => {
      try {
        const response = await usersApi.getProfile();
        updateUser(response.data);
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    const fetchLundaStatus = async () => {
      try {
        const response = await lundaApi.getStatus();
        setLundaStatus(response);
      } catch (error) {
        console.error('Failed to fetch Lunda status:', error);
      } finally {
        setIsLoadingLundaStatus(false);
      }
    };

    fetchCities();
    fetchUserProfile();
    fetchLundaStatus();
  }, [updateUser]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
      setGender(user.gender || 'PREFER_NOT_TO_SAY');
      setPreferredHandLeft(user.preferredHandLeft || false);
      setPreferredHandRight(user.preferredHandRight || false);
      setPreferredCourtSideLeft(user.preferredCourtSideLeft || false);
      setPreferredCourtSideRight(user.preferredCourtSideRight || false);
      setSendTelegramMessages(user.sendTelegramMessages ?? true);
      setSendTelegramInvites(user.sendTelegramInvites ?? true);
    }
  }, [user]);

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    debouncedUpdate({ firstName: value });
  };

  const handleLastNameChange = (value: string) => {
    setLastName(value);
    debouncedUpdate({ lastName: value });
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    debouncedUpdate({ email: value || undefined });
  };

  const handleGenderChange = (value: Gender) => {
    setGender(value);
    updateProfile({ gender: value });
  };

  const handlePreferredHandLeftChange = (value: boolean) => {
    setPreferredHandLeft(value);
    updateProfile({ preferredHandLeft: value });
  };

  const handlePreferredHandRightChange = (value: boolean) => {
    setPreferredHandRight(value);
    updateProfile({ preferredHandRight: value });
  };

  const handlePreferredCourtSideLeftChange = (value: boolean) => {
    setPreferredCourtSideLeft(value);
    updateProfile({ preferredCourtSideLeft: value });
  };

  const handlePreferredCourtSideRightChange = (value: boolean) => {
    setPreferredCourtSideRight(value);
    updateProfile({ preferredCourtSideRight: value });
  };

  const handleSendTelegramMessagesChange = (value: boolean) => {
    setSendTelegramMessages(value);
    updateProfile({ sendTelegramMessages: value });
  };

  const handleSendTelegramInvitesChange = (value: boolean) => {
    setSendTelegramInvites(value);
    updateProfile({ sendTelegramInvites: value });
  };

  const handleChangeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
    updateProfile({ language: lang });
  };

  const handleChangeCity = async (cityId: string) => {
    try {
      const response = await usersApi.switchCity(cityId);
      updateUser(response.data);
      setShowCityModal(false);
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleAvatarUpload = async (avatarFile: File, originalFile: File) => {
    try {
      const response = await mediaApi.uploadAvatar(avatarFile, originalFile);
      updateUser({ 
        ...user!, 
        avatar: response.avatarUrl,
        originalAvatar: response.originalAvatarUrl
      });
      toast.success(t('profile.avatarUploaded'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  };

  const handleAvatarRemove = async () => {
    try {
      await usersApi.updateProfile({ avatar: null, originalAvatar: null });
      const response = await usersApi.getProfile();
      updateUser(response.data);
      toast.success(t('profile.avatarRemoved'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  };

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  if (isLoadingProfile) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('profile.title')}
          </h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6 pt-0">
        <div className="mb-4">
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === 'general'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('profile.general') || 'General'}
            </button>
            <button
              onClick={() => setActiveTab('statistics')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === 'statistics'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('profile.statistics') || 'Statistics'}
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === 'comparison'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('profile.comparison') || 'Comparison'}
            </button>
          </div>
        </div>

        {activeTab === 'general' && (
          <>
        <div className="flex justify-center">
          <div className="relative">
            <AvatarUpload
              currentAvatar={user?.avatar || undefined}
              onUpload={handleAvatarUpload}
              onRemove={handleAvatarRemove}
              disabled={false}
            />
            {!isLoadingProfile && user?.originalAvatar && (
              <button
                onClick={() => setShowFullscreenAvatar(true)}
                className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors duration-200 shadow-lg hover:shadow-xl z-10"
                title={t('profile.viewOriginalAvatar')}
              >
                <Eye size={14} />
              </button>
            )}
            {!isLoadingProfile && user?.level && (
              <div className="absolute -bottom-1 -right-8 bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-1">
                <span>{user.level.toFixed(1)}</span>
                <span>•</span>
                <div className="relative flex items-center">
                  <Beer
                    size={14}
                    className="text-amber-600 dark:text-amber-500 absolute"
                    fill="currentColor"
                  />
                  <Beer
                    size={14}
                    className="text-white dark:text-gray-900 relative z-10"
                    strokeWidth={1.5}
                  />
                </div>
                <span>{user.socialLevel?.toFixed(1) || '1.0'}</span>
              </div>
            )}
          </div>
        </div>

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.personalInfo')}
          </h2>
          <div className="space-y-4">
            <Input
              label={t('auth.firstName')}
              value={firstName}
              onChange={(e) => handleFirstNameChange(e.target.value)}
            />
            <Input
              label={t('auth.lastName')}
              value={lastName}
              onChange={(e) => handleLastNameChange(e.target.value)}
            />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('profile.nameRequirement')}
            </p>
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('profile.gender')}
              </label>
              <Select
                options={[
                  { value: 'MALE', label: t('profile.male') },
                  { value: 'FEMALE', label: t('profile.female') },
                  { value: 'PREFER_NOT_TO_SAY', label: t('profile.preferNotToSay') },
                ]}
                value={gender}
                onChange={(value) => handleGenderChange(value as Gender)}
              />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.telegram')}
          </h2>
          <div className="space-y-4">
            {user?.telegramUsername ? (
              <>
                <Input
                  label={t('profile.telegramUsername')}
                  value={`@${user.telegramUsername}`}
                  disabled
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('profile.sendTelegramMessages')}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {t('profile.sendTelegramMessagesDescription')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendTelegramMessagesChange(!sendTelegramMessages)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                        sendTelegramMessages ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          sendTelegramMessages ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('profile.sendTelegramInvites')}
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('profile.sendTelegramInvitesDescription')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSendTelegramInvitesChange(!sendTelegramInvites)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                          sendTelegramInvites ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            sendTelegramInvites ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {t('profile.telegramNotLinked')}
                </p>
                <Button 
                  onClick={() => window.open('https://t.me/PadelPulseBot', '_blank')}
                >
                  {t('profile.linkTelegram')}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {i18n.language === 'ru' && (
          <Card>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Lunda
            </h2>
            <div className="space-y-4">
              {isLoadingLundaStatus ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Загрузка...
                </p>
              ) : lundaStatus?.hasCookie ? (
                <>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    {lundaStatus.hasProfile
                      ? 'Аккаунт Lunda подключен'
                      : 'Авторизация выполнена. Получите данные профиля'}
                    {lundaStatus.lastSync && (
                      <span className="block text-xs mt-1 text-gray-500 dark:text-gray-500">
                        Последняя синхронизация: {new Date(lundaStatus.lastSync).toLocaleString('ru-RU')}
                      </span>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        setIsUpdatingProfile(true);
                        try {
                          await lundaApi.getProfile({});
                          const response = await usersApi.getProfile();
                          updateUser(response.data);
                          const statusResponse = await lundaApi.getStatus();
                          setLundaStatus(statusResponse);
                          toast.success('Данные из Lunda успешно обновлены');
                        } catch (error: any) {
                          toast.error(error.response?.data?.message || 'Ошибка обновления данных');
                        } finally {
                          setIsUpdatingProfile(false);
                        }
                      }}
                      className="flex-1"
                      variant="primary"
                      disabled={isUpdatingProfile}
                    >
                      {isUpdatingProfile ? 'Обновление...' : 'Обновить профиль'}
                    </Button>
                    <Button
                      onClick={() => setShowLundaModal(true)}
                      className="flex-1"
                      variant="secondary"
                    >
                      Авторизоваться снова
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Подключите аккаунт Lunda Padel для синхронизации данных
                  </p>
                  <Button
                    onClick={() => setShowLundaModal(true)}
                    className="w-full"
                    variant="secondary"
                  >
                    Получить информацию из Lunda
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.preferences')}
          </h2>
          <div className="space-y-6">
            <ToggleGroup
              label={t('profile.preferredHand')}
              options={[
                {
                  value: 'left',
                  label: t('profile.left'),
                  checked: preferredHandLeft,
                  onChange: handlePreferredHandLeftChange,
                },
                {
                  value: 'right',
                  label: t('profile.right'),
                  checked: preferredHandRight,
                  onChange: handlePreferredHandRightChange,
                },
              ]}
            />
            <ToggleGroup
              label={t('profile.preferredCourtSide')}
              options={[
                {
                  value: 'left',
                  label: t('profile.left'),
                  checked: preferredCourtSideLeft,
                  onChange: handlePreferredCourtSideLeftChange,
                },
                {
                  value: 'right',
                  label: t('profile.right'),
                  checked: preferredCourtSideRight,
                  onChange: handlePreferredCourtSideRightChange,
                },
              ]}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.appearance')}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('profile.theme')}
              </label>
              <Select
                options={[
                  { value: 'light', label: t('profile.light'), icon: <Sun size={16} /> },
                  { value: 'dark', label: t('profile.dark'), icon: <Moon size={16} /> },
                  { value: 'system', label: t('profile.system'), icon: <Monitor size={16} /> },
                ]}
                value={theme}
                onChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('profile.language')}
              </label>
              <Select
                options={[
                  { value: 'en', label: 'English', icon: <Globe size={16} /> },
                  { value: 'ru', label: 'Русский', icon: <Globe size={16} /> },
                  { value: 'sr', label: 'Српски', icon: <Globe size={16} /> },
                  { value: 'es', label: 'Español', icon: <Globe size={16} /> },
                ]}
                value={i18n.language}
                onChange={handleChangeLanguage}
              />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.city')}
          </h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={20} className="text-primary-600 dark:text-primary-400" />
              <span className="text-gray-900 dark:text-white">
                {user?.currentCity?.name}
              </span>
            </div>
            <Button variant="secondary" onClick={() => setShowCityModal(true)}>
              {t('profile.changeCity')}
            </Button>
          </div>
        </Card>

        <Card>
          <div className="space-y-4">
            <Button 
              variant="danger" 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              {t('auth.logout')}
            </Button>
          </div>
        </Card>
          </>
        )}

        {activeTab === 'statistics' && (
          <Card>
            <ProfileStatistics />
          </Card>
        )}

        {activeTab === 'comparison' && (
          <Card>
            <ProfileComparison />
          </Card>
        )}
      </div>

      {showCityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full max-h-96 overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {t('profile.changeCity')}
            </h3>
            <div className="space-y-2">
              {cities.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleChangeCity(city.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    city.id === user?.currentCity?.id
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {city.name}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {city.country}
                  </div>
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowCityModal(false)}
              className="w-full mt-4"
            >
              {t('common.cancel')}
            </Button>
          </Card>
        </div>
      )}

      {showFullscreenAvatar && user?.originalAvatar && (
        <FullscreenImageViewer
          imageUrl={UrlConstructor.constructImageUrl(user.originalAvatar)}
          onClose={() => setShowFullscreenAvatar(false)}
        />
      )}

      {showLundaModal && (
        <LundaAccountModal
          onClose={() => setShowLundaModal(false)}
          onSuccess={async () => {
            setShowLundaModal(false);
            try {
              const response = await usersApi.getProfile();
              updateUser(response.data);
              const statusResponse = await lundaApi.getStatus();
              setLundaStatus(statusResponse);
              toast.success('Данные из Lunda успешно синхронизированы');
            } catch (error) {
              console.error('Failed to refresh user profile:', error);
            }
          }}
        />
      )}
    </>
  );
};
