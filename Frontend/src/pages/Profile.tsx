import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, Card, Input, Select, ToggleGroup, AvatarUpload, FullscreenImageViewer } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { usersApi, citiesApi, mediaApi } from '@/api';
import { City, Gender } from '@/types';
import { Moon, Sun, Globe, MapPin, Monitor, LogOut, Eye } from 'lucide-react';
import { UrlConstructor } from '@/utils/urlConstructor';

interface ProfileContentProps {
  firstName: string;
  setFirstName: (value: string) => void;
  lastName: string;
  setLastName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  gender: string;
  setGender: (value: Gender) => void;
  preferredHandLeft: boolean;
  setPreferredHandLeft: (value: boolean) => void;
  preferredHandRight: boolean;
  setPreferredHandRight: (value: boolean) => void;
  preferredCourtSideLeft: boolean;
  setPreferredCourtSideLeft: (value: boolean) => void;
  preferredCourtSideRight: boolean;
  setPreferredCourtSideRight: (value: boolean) => void;
  isEditMode?: boolean;
}

export const ProfileContent = ({
  firstName,
  setFirstName,
  lastName,
  setLastName,
  email,
  setEmail,
  gender,
  setGender,
  preferredHandLeft,
  setPreferredHandLeft,
  preferredHandRight,
  setPreferredHandRight,
  preferredCourtSideLeft,
  setPreferredCourtSideLeft,
  preferredCourtSideRight,
  setPreferredCourtSideRight,
  isEditMode = false
}: ProfileContentProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();

  const [cities, setCities] = useState<City[]>([]);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

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

    fetchCities();
    fetchUserProfile();
  }, [updateUser]);

  const handleChangeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
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
      // Refetch the profile to get updated data
      const response = await usersApi.getProfile();
      updateUser(response.data);
      toast.success(t('profile.avatarRemoved'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  };

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

      <div className="space-y-6 pt-5">
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
              <div className="absolute -bottom-1 -right-8 bg-primary-600 text-white text-xs font-semibold px-2 py-1 rounded-full shadow-lg">
                {t('rating.level')}: {user.level}
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
              onChange={(e) => setFirstName(e.target.value)}
              disabled={!isEditMode}
            />
            <Input
              label={t('auth.lastName')}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={!isEditMode}
            />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('profile.nameRequirement')}
            </p>
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isEditMode}
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
                onChange={(value) => setGender(value as Gender)}
                disabled={!isEditMode}
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
              <Input
                label={t('profile.telegramUsername')}
                value={`@${user.telegramUsername}`}
                disabled
              />
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
                  onChange: setPreferredHandLeft,
                },
                {
                  value: 'right',
                  label: t('profile.right'),
                  checked: preferredHandRight,
                  onChange: setPreferredHandRight,
                },
              ]}
              disabled={!isEditMode}
            />
            <ToggleGroup
              label={t('profile.preferredCourtSide')}
              options={[
                {
                  value: 'left',
                  label: t('profile.left'),
                  checked: preferredCourtSideLeft,
                  onChange: setPreferredCourtSideLeft,
                },
                {
                  value: 'right',
                  label: t('profile.right'),
                  checked: preferredCourtSideRight,
                  onChange: setPreferredCourtSideRight,
                },
              ]}
              disabled={!isEditMode}
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
                disabled={!isEditMode}
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
            <Button variant="secondary" onClick={() => setShowCityModal(true)} disabled={!isEditMode}>
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
    </>
  );
};
