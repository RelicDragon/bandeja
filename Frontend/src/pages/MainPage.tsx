import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { useNavigationStore } from '@/store/navigationStore';
import { HomeContent } from './Home';
import { ProfileContent } from './Profile';
import { GameDetailsContent } from './GameDetails';
import { BugsContent } from './Bugs';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api/users';
import { toast } from 'react-hot-toast';
import { Gender } from '@/types';

export const MainPage = () => {
  const location = useLocation();
  const { currentPage, setCurrentPage, isAnimating } = useNavigationStore();
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuthStore();
  
  // Profile state
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [gender, setGender] = useState(user?.gender || 'PREFER_NOT_TO_SAY');
  const [preferredHandLeft, setPreferredHandLeft] = useState(user?.preferredHandLeft || false);
  const [preferredHandRight, setPreferredHandRight] = useState(user?.preferredHandRight || false);
  const [preferredCourtSideLeft, setPreferredCourtSideLeft] = useState(user?.preferredCourtSideLeft || false);
  const [preferredCourtSideRight, setPreferredCourtSideRight] = useState(user?.preferredCourtSideRight || false);
  const [sendTelegramMessages, setSendTelegramMessages] = useState(user?.sendTelegramMessages ?? true);
  
  // Snapshot for canceling
  const [profileSnapshot, setProfileSnapshot] = useState<any>(null);

  // Profile handlers
  const isNameValid = () => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const fullName = trimmedFirst + trimmedLast;
    const alphabeticChars = fullName.replace(/[^a-zA-Z]/g, '');
    return alphabeticChars.length >= 3;
  };

  const handleProfileEditModeToggle = () => {
    if (profileEditMode) {
      // Cancel - restore from snapshot
      if (profileSnapshot) {
        setFirstName(profileSnapshot.firstName);
        setLastName(profileSnapshot.lastName);
        setEmail(profileSnapshot.email);
        setGender(profileSnapshot.gender);
        setPreferredHandLeft(profileSnapshot.preferredHandLeft);
        setPreferredHandRight(profileSnapshot.preferredHandRight);
        setPreferredCourtSideLeft(profileSnapshot.preferredCourtSideLeft);
        setPreferredCourtSideRight(profileSnapshot.preferredCourtSideRight);
        setSendTelegramMessages(profileSnapshot.sendTelegramMessages);
      }
      setProfileEditMode(false);
      setProfileSnapshot(null);
    } else {
      // Enter edit mode - create snapshot
      setProfileSnapshot({
        firstName,
        lastName,
        email,
        gender,
        preferredHandLeft,
        preferredHandRight,
        preferredCourtSideLeft,
        preferredCourtSideRight,
        sendTelegramMessages,
      });
      setProfileEditMode(true);
    }
  };

  const handleProfileSaveChanges = async () => {
    if (!isNameValid()) {
      toast.error(t('profile.invalidName'));
      return;
    }

    setProfileSaving(true);
    try {
      const response = await usersApi.updateProfile({
        firstName,
        lastName,
        email: email || undefined,
        language: i18n.language,
        gender: gender as Gender,
        preferredHandLeft,
        preferredHandRight,
        preferredCourtSideLeft,
        preferredCourtSideRight,
        sendTelegramMessages,
      });
      updateUser(response.data);
      
      // Sync form state with response data to ensure consistency
      const savedUser = response.data;
      setFirstName(savedUser.firstName || '');
      setLastName(savedUser.lastName || '');
      setEmail(savedUser.email || '');
      setGender(savedUser.gender || 'PREFER_NOT_TO_SAY');
      setPreferredHandLeft(savedUser.preferredHandLeft || false);
      setPreferredHandRight(savedUser.preferredHandRight || false);
      setPreferredCourtSideLeft(savedUser.preferredCourtSideLeft || false);
      setPreferredCourtSideRight(savedUser.preferredCourtSideRight || false);
      setSendTelegramMessages(savedUser.sendTelegramMessages ?? true);
      
      toast.success(t('profile.saved'));
      setProfileSnapshot(null);
      setProfileEditMode(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    } finally {
      setProfileSaving(false);
    }
  };

  // Auto-cancel when navigating away from profile in edit mode
  useEffect(() => {
    if (profileEditMode && currentPage !== 'profile') {
      // Cancel - restore from snapshot
      if (profileSnapshot) {
        setFirstName(profileSnapshot.firstName);
        setLastName(profileSnapshot.lastName);
        setEmail(profileSnapshot.email);
        setGender(profileSnapshot.gender);
        setPreferredHandLeft(profileSnapshot.preferredHandLeft);
        setPreferredHandRight(profileSnapshot.preferredHandRight);
        setPreferredCourtSideLeft(profileSnapshot.preferredCourtSideLeft);
        setPreferredCourtSideRight(profileSnapshot.preferredCourtSideRight);
      }
      setProfileEditMode(false);
      setProfileSnapshot(null);
    }
  }, [currentPage, profileEditMode, profileSnapshot]);

  // Update form state when user changes (only when not in edit mode and no snapshot)
  useEffect(() => {
    if (user && !profileEditMode && !profileSnapshot) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
      setGender(user.gender || 'PREFER_NOT_TO_SAY');
      setPreferredHandLeft(user.preferredHandLeft || false);
      setPreferredHandRight(user.preferredHandRight || false);
      setPreferredCourtSideLeft(user.preferredCourtSideLeft || false);
      setPreferredCourtSideRight(user.preferredCourtSideRight || false);
      setSendTelegramMessages(user.sendTelegramMessages ?? true);
    }
  }, [user, profileEditMode, profileSnapshot]);
  useEffect(() => {
    if (isAnimating) return;

    const path = location.pathname;
    if (path === '/profile') {
      setCurrentPage('profile');
    } else if (path === '/bugs') {
      setCurrentPage('bugs');
    } else if (path.startsWith('/games/') && !path.includes('/chat')) {
      setCurrentPage('gameDetails');
    } else if (path === '/') {
      setCurrentPage('home');
    }
  }, [location.pathname, setCurrentPage, isAnimating]);

  return (
    <MainLayout
      profileEditMode={profileEditMode}
      onProfileEditModeToggle={handleProfileEditModeToggle}
      onProfileSaveChanges={handleProfileSaveChanges}
      profileSaveDisabled={profileSaving}
    >
      <div className="relative overflow-hidden">
        {/* Home Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'home' 
            ? 'opacity-100 transform translate-x-0' 
            : 'opacity-0 transform -translate-x-full absolute inset-0'
        }`}>
          <HomeContent />
        </div>

        {/* Profile Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'profile' 
            ? 'opacity-100 transform translate-x-0' 
            : 'opacity-0 transform translate-x-full absolute inset-0'
        }`}>
          <ProfileContent 
            firstName={firstName}
            setFirstName={setFirstName}
            lastName={lastName}
            setLastName={setLastName}
            email={email}
            setEmail={setEmail}
            gender={gender}
            setGender={setGender}
            preferredHandLeft={preferredHandLeft}
            setPreferredHandLeft={setPreferredHandLeft}
            preferredHandRight={preferredHandRight}
            setPreferredHandRight={setPreferredHandRight}
            preferredCourtSideLeft={preferredCourtSideLeft}
            setPreferredCourtSideLeft={setPreferredCourtSideLeft}
            preferredCourtSideRight={preferredCourtSideRight}
            setPreferredCourtSideRight={setPreferredCourtSideRight}
            sendTelegramMessages={sendTelegramMessages}
            setSendTelegramMessages={setSendTelegramMessages}
            isEditMode={profileEditMode}
          />
        </div>

        {/* Game Details Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'gameDetails'
            ? 'opacity-100 transform translate-x-0'
            : 'opacity-0 transform translate-x-full absolute inset-0'
        }`}>
          <GameDetailsContent />
        </div>

        {/* Bugs Page */}
        <div className={`transition-all duration-300 ease-in-out ${
          currentPage === 'bugs'
            ? 'opacity-100 transform translate-x-0'
            : 'opacity-0 transform translate-x-full absolute inset-0'
        }`}>
          <BugsContent />
        </div>
      </div>
    </MainLayout>
  );
};
