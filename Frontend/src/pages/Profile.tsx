import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { Button, Card, Input, Select, ToggleGroup, AvatarUpload, FullscreenImageViewer, WalletModal, NotificationSettingsModal, ConfirmationModal } from '@/components';
import { ProfileStatistics } from '@/components/ProfileStatistics';
import { ProfileComparison } from '@/components/ProfileComparison';
import { BlockedUsersSection } from '@/components/BlockedUsersSection';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useNavigationStore } from '@/store/navigationStore';
import { usersApi, citiesApi, mediaApi, authApi } from '@/api';
import { signInWithApple } from '@/services/appleAuth.service';
import { signInWithGoogle } from '@/services/googleAuth.service';
import { City, Gender, User } from '@/types';
import { Moon, Sun, Globe, MapPin, Monitor, LogOut, Eye, Beer, Wallet, Check, Loader2, Trash2, X, UserCircle } from 'lucide-react';
import { hasValidUsername } from '@/utils/userValidation';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { extractLanguageCode, normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { isCapacitor, getAppInfo, isIOS } from '@/utils/capacitor';
import { AppleIcon } from '@/components/AppleIcon';

export const ProfileContent = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { profileActiveTab } = useNavigationStore();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [gender, setGender] = useState<Gender>(user?.gender || 'PREFER_NOT_TO_SAY');
  const [genderIsSet, setGenderIsSet] = useState(user?.genderIsSet ?? false);
  const [preferNotToSayAcknowledged, setPreferNotToSayAcknowledged] = useState(
    user?.gender === 'PREFER_NOT_TO_SAY' && user?.genderIsSet === true
  );
  const [preferredHandLeft, setPreferredHandLeft] = useState(user?.preferredHandLeft || false);
  const [preferredHandRight, setPreferredHandRight] = useState(user?.preferredHandRight || false);
  const [preferredCourtSideLeft, setPreferredCourtSideLeft] = useState(user?.preferredCourtSideLeft || false);
  const [preferredCourtSideRight, setPreferredCourtSideRight] = useState(user?.preferredCourtSideRight || false);
  const [language, setLanguage] = useState(normalizeLanguageForProfile(user?.language) || 'auto');
  const [timeFormat, setTimeFormat] = useState<'auto' | '12h' | '24h'>(user?.timeFormat || 'auto');
  const [weekStart, setWeekStart] = useState<'auto' | 'monday' | 'sunday'>(user?.weekStart || 'auto');

  const [cities, setCities] = useState<City[]>([]);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [showSecondDeleteConfirmation, setShowSecondDeleteConfirmation] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [appVersion, setAppVersion] = useState<{ version: string; buildNumber: string } | null>(null);
  const [nameError, setNameError] = useState('');
  const [nameValidationStatus, setNameValidationStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isLinkingApple, setIsLinkingApple] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isUnlinkingApple, setIsUnlinkingApple] = useState(false);
  const [isUnlinkingGoogle, setIsUnlinkingGoogle] = useState(false);
  const [showUnlinkAppleModal, setShowUnlinkAppleModal] = useState(false);
  const [showUnlinkGoogleModal, setShowUnlinkGoogleModal] = useState(false);

  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    try {
      const response = await usersApi.updateProfile(updates);
      console.log(response.data);
      updateUser(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  }, [updateUser, t]);

  const debouncedUpdate = useCallback((updates: Partial<User>, skipValidation = false) => {
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    if (!skipValidation && (updates.firstName !== undefined || updates.lastName !== undefined)) {
      const newFirstName = updates.firstName !== undefined ? updates.firstName : firstName;
      const newLastName = updates.lastName !== undefined ? updates.lastName : lastName;
      
      // For Apple-authenticated users, allow empty names since Apple may not provide them
      // This complies with Apple's guidelines: never require information Apple already provides
      const isAppleAuth = user?.authProvider === 'APPLE' || user?.appleSub;
      const isEmpty = (!newFirstName || newFirstName.trim() === '') && (!newLastName || newLastName.trim() === '');
      
      if (!isAppleAuth || !isEmpty) {
        const testUser: User = {
          ...user!,
          firstName: newFirstName,
          lastName: newLastName,
        };
        
        if (!hasValidUsername(testUser)) {
          setNameError(t('profile.nameValidationError') || 'At least one name must have at least 3 characters');
          setNameValidationStatus('error');
          return;
        }
      }
      
      setNameError('');
      setNameValidationStatus('saving');
    }
    
    updateTimeoutRef.current = setTimeout(async () => {
      try {
        await updateProfile(updates);
        if (!skipValidation && (updates.firstName !== undefined || updates.lastName !== undefined)) {
          setNameValidationStatus('saved');
          setTimeout(() => setNameValidationStatus('idle'), 2000);
        }
      } catch (error) {
        if (!skipValidation && (updates.firstName !== undefined || updates.lastName !== undefined)) {
          setNameValidationStatus('error');
        }
      }
    }, 500);
  }, [updateProfile, firstName, lastName, user, t]);

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

    const loadAppInfo = async () => {
      if (isCapacitor()) {
        const info = await getAppInfo();
        if (info) {
          setAppVersion({
            version: info.version,
            buildNumber: String(info.buildNumber),
          });
        }
      }
    };

    fetchCities();
    if (!user) {
      fetchUserProfile();
    } else {
      setIsLoadingProfile(false);
    }
    loadAppInfo();
  }, [updateUser, user]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
      setGender(user.gender || 'PREFER_NOT_TO_SAY');
      setGenderIsSet(user.genderIsSet ?? false);
      setPreferNotToSayAcknowledged(
        user.gender === 'PREFER_NOT_TO_SAY' && user.genderIsSet === true
      );
      setPreferredHandLeft(user.preferredHandLeft || false);
      setPreferredHandRight(user.preferredHandRight || false);
      setPreferredCourtSideLeft(user.preferredCourtSideLeft || false);
      setPreferredCourtSideRight(user.preferredCourtSideRight || false);
    }
  }, [user]);

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    if (nameError) {
      setNameError('');
      setNameValidationStatus('idle');
    }
    debouncedUpdate({ firstName: value });
  };

  const handleLastNameChange = (value: string) => {
    setLastName(value);
    if (nameError) {
      setNameError('');
      setNameValidationStatus('idle');
    }
    debouncedUpdate({ lastName: value });
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    debouncedUpdate({ email: value || undefined });
  };

  const handleGenderChange = (value: Gender) => {
    setGender(value);
    if (value === 'MALE' || value === 'FEMALE') {
      setGenderIsSet(true);
      setPreferNotToSayAcknowledged(false);
      updateProfile({ gender: value, genderIsSet: true });
    } else if (value === 'PREFER_NOT_TO_SAY') {
      setPreferNotToSayAcknowledged(false);
      if (genderIsSet) {
        setGenderIsSet(false);
        updateProfile({ gender: value, genderIsSet: false });
      } else {
        updateProfile({ gender: value });
      }
    }
  };

  const handlePreferNotToSayAcknowledged = (checked: boolean) => {
    setPreferNotToSayAcknowledged(checked);
    if (checked && gender === 'PREFER_NOT_TO_SAY') {
      setGenderIsSet(true);
      updateProfile({ gender: 'PREFER_NOT_TO_SAY', genderIsSet: true });
    }
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


  const handleChangeLanguage = (locale: string) => {
    setLanguage(locale);
    const langCode = extractLanguageCode(locale);
    i18n.changeLanguage(langCode);
    updateProfile({ language: locale });
  };

  const handleChangeTimeFormat = (format: 'auto' | '12h' | '24h') => {
    setTimeFormat(format);
    updateProfile({ timeFormat: format });
  };

  const handleChangeWeekStart = (start: 'auto' | 'monday' | 'sunday') => {
    setWeekStart(start);
    updateProfile({ weekStart: start });
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

  const handleFirstDeleteConfirmation = () => {
    setShowDeleteUserModal(false);
    setShowSecondDeleteConfirmation(true);
  };

  const handleDeleteUser = async () => {
    try {
      setIsDeletingUser(true);
      await usersApi.deleteUser();
      toast.success(t('profile.userDeleted') || 'Account deleted successfully');
      logout();
      navigate('/login');
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
      setIsDeletingUser(false);
      setShowSecondDeleteConfirmation(false);
    }
  };

  const handleLinkApple = async () => {
    console.log('[APPLE_LINK] handleLinkApple called');
    try {
      setIsLinkingApple(true);
      console.log('[APPLE_LINK] Calling signInWithApple');
      const result = await signInWithApple();
      
      if (!result) {
        console.log('[APPLE_LINK] signInWithApple returned null (user cancelled)');
        setIsLinkingApple(false);
        return;
      }

      console.log('[APPLE_LINK] Apple sign-in successful, calling linkApple API');
      const response = await authApi.linkApple({
        identityToken: result.result.identityToken,
        nonce: result.nonce,
      });

      console.log('[APPLE_LINK] Apple account linked successfully');
      updateUser(response.data.user);
      toast.success(t('profile.appleLinked') || 'Apple account linked successfully');
    } catch (error: any) {
      console.error('[APPLE_LINK] Error linking Apple account:', error);
      const errorMessage = error.response?.data?.message || error.message || t('errors.generic');
      toast.error(t(errorMessage) !== errorMessage ? t(errorMessage) : errorMessage);
    } finally {
      setIsLinkingApple(false);
      console.log('[APPLE_LINK] handleLinkApple completed');
    }
  };

  const handleUnlinkApple = async () => {
    console.log('[APPLE_UNLINK] handleUnlinkApple called');
    try {
      setIsUnlinkingApple(true);
      console.log('[APPLE_UNLINK] Calling unlinkApple API');
      const response = await authApi.unlinkApple();
      console.log('[APPLE_UNLINK] Apple account unlinked successfully');
      updateUser(response.data.user);
      toast.success(t('profile.appleUnlinked') || 'Apple account unlinked successfully');
      setShowUnlinkAppleModal(false);
    } catch (error: any) {
      console.error('[APPLE_UNLINK] Error unlinking Apple account:', error);
      const errorMessage = error.response?.data?.message || error.message || t('errors.generic');
      toast.error(t(errorMessage) !== errorMessage ? t(errorMessage) : errorMessage);
    } finally {
      setIsUnlinkingApple(false);
      console.log('[APPLE_UNLINK] handleUnlinkApple completed');
    }
  };

  const handleLinkGoogle = async () => {
    try {
      setIsLinkingGoogle(true);
      const result = await signInWithGoogle();
      
      if (!result || !result.idToken) {
        setIsLinkingGoogle(false);
        return;
      }

      const response = await authApi.linkGoogle({
        idToken: result.idToken,
      });

      updateUser(response.data.user);
      toast.success(t('profile.googleLinked') || 'Google account linked successfully');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || t('errors.generic');
      toast.error(t(errorMessage) !== errorMessage ? t(errorMessage) : errorMessage);
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    try {
      setIsUnlinkingGoogle(true);
      const response = await authApi.unlinkGoogle();
      updateUser(response.data.user);
      toast.success(t('profile.googleUnlinked') || 'Google account unlinked successfully');
      setShowUnlinkGoogleModal(false);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || t('errors.generic');
      toast.error(t(errorMessage) !== errorMessage ? t(errorMessage) : errorMessage);
    } finally {
      setIsUnlinkingGoogle(false);
    }
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
    if (user) {
      setLanguage(normalizeLanguageForProfile(user.language) || 'auto');
      setTimeFormat(user.timeFormat || 'auto');
      setWeekStart(user.weekStart || 'auto');
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    try {
      const response = await usersApi.getProfile();
      updateUser(response.data);
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  }, [updateUser]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: isLoadingProfile,
  });

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
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
      <div className="space-y-6">
        {profileActiveTab === 'general' && (
          <>
        <div className="flex justify-center">
          <div className="relative pt-2">
            <AvatarUpload
              currentAvatar={user?.avatar || undefined}
              onUpload={handleAvatarUpload}
              disabled={false}
            />
            {!isLoadingProfile && user?.wallet !== undefined && (
              <button
                onClick={() => setShowWalletModal(true)}
                className="absolute top-0 -left-10 bg-primary-600 dark:bg-primary-500 text-white px-2 py-1 rounded-full font-bold text-sm flex items-center gap-1 z-10 hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors cursor-pointer"
                style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
              >
                <Wallet size={14} className="text-white" />
                <span>{user.wallet}</span>
              </button>
            )}
            {!isLoadingProfile && user?.avatar && (
              <button
                onClick={handleAvatarRemove}
                className="absolute top-0 -right-8 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors duration-200 z-10"
                style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                title={t('profile.removeAvatar')}
              >
                <X size={14} />
              </button>
            )}
            {!isLoadingProfile && user?.originalAvatar && (
              <button
                onClick={() => setShowFullscreenAvatar(true)}
                className="absolute top-8 -right-8 w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors duration-200 z-10"
                style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }}
                title={t('profile.viewOriginalAvatar')}
              >
                <Eye size={14} />
              </button>
            )}
            {!isLoadingProfile && user?.level && (
              <div className="absolute -bottom-1 -right-20 bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-1">
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
                <span>{user.socialLevel.toFixed(1)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.personalInfo')}
          </h2>
          <div className="space-y-4">
            <div className="relative">
              <Input
                label={t('auth.firstName')}
                value={firstName}
                onChange={(e) => handleFirstNameChange(e.target.value)}
                error={nameError}
              />
              {nameValidationStatus === 'saving' && (
                <div className="absolute right-3 top-9">
                  <Loader2 size={16} className="animate-spin text-primary-600 dark:text-primary-400" />
                </div>
              )}
              {nameValidationStatus === 'saved' && (
                <div className="absolute right-3 top-9">
                  <Check size={16} className="text-green-600 dark:text-green-400" />
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                label={t('auth.lastName')}
                value={lastName}
                onChange={(e) => handleLastNameChange(e.target.value)}
                error={nameError}
              />
              {nameValidationStatus === 'saving' && (
                <div className="absolute right-3 top-9">
                  <Loader2 size={16} className="animate-spin text-primary-600 dark:text-primary-400" />
                </div>
              )}
              {nameValidationStatus === 'saved' && (
                <div className="absolute right-3 top-9">
                  <Check size={16} className="text-green-600 dark:text-green-400" />
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('profile.nameRequirement')}
            </p>
            <Input
              label={t('auth.email')}
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
            />
            {(!user?.genderIsSet || !genderIsSet) ? (
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
                {gender === 'PREFER_NOT_TO_SAY' && (
                  <div className="mt-3 flex items-start">
                    <input
                      type="checkbox"
                      id="prefer-not-to-say-ack"
                      checked={preferNotToSayAcknowledged}
                      onChange={(e) => handlePreferNotToSayAcknowledged(e.target.checked)}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="prefer-not-to-say-ack" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      {t('profile.preferNotToSayAcknowledgment')}
                    </label>
                  </div>
                )}
              </div>
            ) : (
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
                {gender === 'PREFER_NOT_TO_SAY' && (
                  <div className="mt-3 flex items-start">
                    <input
                      type="checkbox"
                      id="prefer-not-to-say-ack-set"
                      checked={preferNotToSayAcknowledged}
                      onChange={(e) => handlePreferNotToSayAcknowledged(e.target.checked)}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="prefer-not-to-say-ack-set" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      {t('profile.preferNotToSayAcknowledgment')}
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            {t('profile.connectedAccounts') || 'Connected Accounts'}
          </h2>
          <div className="space-y-4">
            {/* Apple */}
            {(user?.appleSub || isIOS()) && (
              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center flex-shrink-0">
                    <AppleIcon size={20} className="text-white dark:text-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {t('profile.apple') || 'Apple'}
                    </div>
                    {user?.appleSub ? (
                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {user.appleEmail || t('profile.linked') || 'Linked'}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-500">
                        {t('profile.appleNotLinked') || 'Apple account not linked'}
                      </div>
                    )}
                  </div>
                  {user?.appleSub && (
                    <Check className="text-green-600 dark:text-green-400 flex-shrink-0" size={20} />
                  )}
                </div>
                {user?.appleSub ? (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      onClick={() => setShowUnlinkAppleModal(true)}
                      disabled={isUnlinkingApple}
                      size="sm"
                    >
                      {isUnlinkingApple ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        t('profile.unlinkApple') || 'Unlink'
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={handleLinkApple}
                    disabled={isLinkingApple}
                    className="w-full h-10 text-sm font-medium bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-100 dark:text-black"
                  >
                    {isLinkingApple ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <AppleIcon size={16} />
                        {t('profile.linkApple') || 'Link Apple'}
                      </span>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Google */}
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <g fill="none" fillRule="evenodd">
                      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.55 0 9c0 1.45.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </g>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('profile.google') || 'Google'}
                  </div>
                  {user?.googleId ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {user.googleEmail || t('profile.linked') || 'Linked'}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      {t('profile.googleNotLinked') || 'Google account not linked'}
                    </div>
                  )}
                </div>
                {user?.googleId && (
                  <Check className="text-green-600 dark:text-green-400 flex-shrink-0" size={20} />
                )}
              </div>
              {user?.googleId ? (
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => setShowUnlinkGoogleModal(true)}
                    disabled={isUnlinkingGoogle}
                    size="sm"
                  >
                    {isUnlinkingGoogle ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      t('profile.unlinkGoogle') || 'Unlink'
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleLinkGoogle}
                  disabled={isLinkingGoogle}
                  className="w-full h-10 text-sm font-medium !bg-gray-50 hover:!bg-gray-100 !text-slate-900 !border-2 !border-slate-300 dark:!bg-slate-600 dark:hover:!bg-slate-500 dark:!text-slate-100 dark:!border-slate-500 !shadow-md"
                >
                  {isLinkingGoogle ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                        <g fill="none" fillRule="evenodd">
                          <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                          <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.55 0 9c0 1.45.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                        </g>
                      </svg>
                      {t('profile.linkGoogle') || 'Link Google'}
                    </span>
                  )}
                </Button>
              )}
            </div>

            {/* Telegram */}
            <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13"/>
                    <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {t('profile.telegram')}
                  </div>
                  {user?.telegramUsername ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      @{user.telegramUsername}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-500">
                      {t('profile.telegramNotLinked')}
                    </div>
                  )}
                </div>
                {user?.telegramUsername && (
                  <Check className="text-green-600 dark:text-green-400 flex-shrink-0" size={20} />
                )}
              </div>
              {!user?.telegramUsername && (
                <Button
                  onClick={() => window.open('https://t.me/PadelPulseBot', '_blank')}
                  className="w-full h-10 text-sm font-medium"
                >
                  {t('profile.linkTelegram')}
                </Button>
              )}
            </div>
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
                  { value: 'light', label: t('profile.light'), icon: <Sun size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'dark', label: t('profile.dark'), icon: <Moon size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'system', label: t('profile.system'), icon: <Monitor size={16} className="text-gray-900 dark:text-white" /> },
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
                  { value: 'auto', label: t('profile.auto') || 'Auto', icon: <Globe size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'en-US', label: 'English (US)', icon: <Globe size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'en-GB', label: 'English (UK)', icon: <Globe size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'ru-RU', label: 'Русский', icon: <Globe size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'sr-RS', label: 'Српски', icon: <Globe size={16} className="text-gray-900 dark:text-white" /> },
                  { value: 'es-ES', label: 'Español', icon: <Globe size={16} className="text-gray-900 dark:text-white" /> },
                ]}
                value={language}
                onChange={handleChangeLanguage}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('profile.timeFormat') || 'Time Format'}
              </label>
              <Select
                options={[
                  { value: 'auto', label: t('profile.auto') || 'Auto' },
                  { value: '12h', label: t('profile.timeFormat12h') || '12-hour' },
                  { value: '24h', label: t('profile.timeFormat24h') || '24-hour' },
                ]}
                value={timeFormat}
                onChange={(value) => handleChangeTimeFormat(value as 'auto' | '12h' | '24h')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('profile.weekStart') || 'Week Start'}
              </label>
              <Select
                options={[
                  { value: 'auto', label: t('profile.auto') || 'Auto' },
                  { value: 'monday', label: t('profile.monday') || 'Monday' },
                  { value: 'sunday', label: t('profile.sunday') || 'Sunday' },
                ]}
                value={weekStart}
                onChange={(value) => handleChangeWeekStart(value as 'auto' | 'monday' | 'sunday')}
              />
            </div>

            <div>
              <Button
                variant="primary"
                onClick={() => navigate('/character')}
                className="w-full flex items-center justify-center gap-2 rounded-xl"
              >
                <UserCircle size={16} />
                {t('profile.characterCreation') || 'Character Creation'}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {t('profile.notificationSettings') || 'Notification Settings'}
          </h2>
          <div className="space-y-4">
            <Button
              variant="primary"
              onClick={() => setShowNotificationModal(true)}
              className="w-full rounded-xl"
            >
              {t('profile.controlNotifications') || 'Control Notifications'}
            </Button>
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

        {user?.blockedUserIds && user.blockedUserIds.length > 0 && (
          <BlockedUsersSection />
        )}
        </div>

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

        <div className="text-center pt-4">
          <button
            onClick={() => setShowDeleteUserModal(true)}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors underline text-sm inline-flex items-center gap-1"
            disabled={isDeletingUser}
          >
            <Trash2 size={14} />
            {t('profile.deleteUser')}
          </button>
        </div>
          </>
        )}

        {profileActiveTab === 'statistics' && (
          <ProfileStatistics />
        )}

        {profileActiveTab === 'comparison' && (
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
          imageUrl={user.originalAvatar || ''}
          onClose={() => setShowFullscreenAvatar(false)}
          isOpen={showFullscreenAvatar}
        />
      )}

      <AnimatePresence>
        {showWalletModal && (
          <WalletModal
            onClose={() => setShowWalletModal(false)}
          />
        )}
      </AnimatePresence>

      <NotificationSettingsModal
        isOpen={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        user={user}
        onUpdate={updateUser}
      />

      <ConfirmationModal
        isOpen={showDeleteUserModal}
        onClose={() => setShowDeleteUserModal(false)}
        onConfirm={handleFirstDeleteConfirmation}
        title={t('profile.deleteUserTitle')}
        message={t('profile.deleteUserMessage')}
        confirmText={t('profile.deleteUserConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
      />

      <ConfirmationModal
        isOpen={showSecondDeleteConfirmation}
        onClose={() => setShowSecondDeleteConfirmation(false)}
        onConfirm={handleDeleteUser}
        title={t('profile.deleteUserSecondTitle')}
        message={t('profile.deleteUserSecondMessage')}
        confirmText={t('profile.deleteUserSecondConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
      />

      <ConfirmationModal
        isOpen={showUnlinkAppleModal}
        onClose={() => setShowUnlinkAppleModal(false)}
        onConfirm={handleUnlinkApple}
        title={t('profile.unlinkApple') || 'Unlink Apple Account'}
        message={t('profile.unlinkAppleConfirmation') || 'Are you sure you want to unlink your Apple account? You will no longer be able to sign in with Apple.'}
        confirmText={isUnlinkingApple ? (t('profile.unlinking') || 'Unlinking...') : (t('profile.unlink') || 'Unlink')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
      />

      <ConfirmationModal
        isOpen={showUnlinkGoogleModal}
        onClose={() => setShowUnlinkGoogleModal(false)}
        onConfirm={handleUnlinkGoogle}
        title={t('profile.unlinkGoogle') || 'Unlink Google Account'}
        message={t('profile.unlinkGoogleConfirmation') || 'Are you sure you want to unlink your Google account? You will no longer be able to sign in with Google.'}
        confirmText={isUnlinkingGoogle ? (t('profile.unlinking') || 'Unlinking...') : (t('profile.unlink') || 'Unlink')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
      />

      <div className="mt-8 text-center space-y-2">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <a
            href="/eula/world/eula.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors underline"
            onClick={(e) => {
              e.preventDefault();
              window.open('/eula/world/eula.html', '_blank');
            }}
          >
            {t('auth.eula') || 'Terms of Service'}
          </a>
        </div>
        {appVersion && (
          <div className="text-xs text-gray-400 dark:text-gray-500">
            App Version: {appVersion.version} (Build {appVersion.buildNumber})
          </div>
        )}
      </div>
      </div>
    </>
  );
};
