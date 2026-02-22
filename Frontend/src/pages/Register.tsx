import { useState, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input, Select } from '@/components';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import pushNotificationService from '@/services/pushNotificationService';
import { Gender } from '@/types';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { openEula } from '@/utils/openEula';

export const Register = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<Gender>('PREFER_NOT_TO_SAY');
  const [genderAcknowledged, setGenderAcknowledged] = useState(false);
  const [acceptedEula, setAcceptedEula] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const firstNameRef = useRef<HTMLDivElement>(null);
  const lastNameRef = useRef<HTMLDivElement>(null);
  const genderRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLDivElement>(null);
  const passwordConfirmRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLDivElement>(null);
  const eulaRef = useRef<HTMLDivElement>(null);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (trimmedFirst.length === 0 && trimmedLast.length === 0) {
      errors.firstName = t('auth.firstNameRequired') || 'First name or last name is required';
    } else if (trimmedFirst.length < 3 && trimmedLast.length < 3) {
      errors.firstName = t('auth.nameMinLength') || 'At least one name must have at least 3 characters';
    }
    
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone) {
      errors.phone = t('auth.phoneRequired') || 'Phone number is required';
    } else if (!phone.startsWith('+')) {
      errors.phone = t('auth.phoneFormat') || 'Phone number must start with +';
    } else if (phoneDigits.length < 7) {
      errors.phone = t('auth.phoneMinLength') || 'Phone number must have at least 7 digits';
    }
    
    if (!password) {
      errors.password = t('auth.passwordRequired') || 'Password is required';
    } else if (password.length < 6) {
      errors.password = t('auth.passwordMinLength') || 'Password must be at least 6 characters';
    }
    
    if (!passwordConfirm) {
      errors.passwordConfirm = t('auth.passwordConfirmRequired') || 'Please confirm your password';
    } else if (password !== passwordConfirm) {
      errors.passwordConfirm = t('auth.passwordsDoNotMatch') || 'Passwords do not match';
    }
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = t('auth.emailInvalid') || 'Invalid email format';
    }
    
    if (gender === 'PREFER_NOT_TO_SAY' && !genderAcknowledged) {
      errors.gender = t('auth.genderAcknowledgmentRequired') || 'You must acknowledge the gender preference';
    }
    
    if (!acceptedEula) {
      errors.eula = t('auth.eulaRequired') || 'You must accept the Terms of Service';
    }
    
    return errors;
  }, [firstName, lastName, phone, password, passwordConfirm, email, gender, genderAcknowledged, acceptedEula, t]);

  const getVisibleErrors = () => {
    return validationErrors;
  };

  const scrollToFirstError = () => {
    const errorFields = ['firstName', 'lastName', 'gender', 'phone', 'password', 'passwordConfirm', 'email', 'eula'];
    const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
      firstName: firstNameRef,
      lastName: lastNameRef,
      gender: genderRef,
      phone: phoneRef,
      password: passwordRef,
      passwordConfirm: passwordConfirmRef,
      email: emailRef,
      eula: eulaRef,
    };

    for (const field of errorFields) {
      if (validationErrors[field] && refs[field]?.current) {
        const element = refs[field].current;
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
        
        if (!isVisible) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        break;
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setShowAllErrors(true);
    
    if (Object.keys(validationErrors).length > 0) {
      scrollToFirstError();
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const genderIsSet = gender === 'MALE' || gender === 'FEMALE' || (gender === 'PREFER_NOT_TO_SAY' && genderAcknowledged);
      const normalizedLanguage = normalizeLanguageForProfile(i18n.language);
      const response = await authApi.registerPhone({
        phone,
        password,
        firstName,
        lastName,
        email: email || undefined,
        gender,
        genderIsSet,
        language: normalizedLanguage,
      });
      await setAuth(response.data.user, response.data.token);
      await pushNotificationService.ensureTokenSentToBackend();
      navigate('/select-city');
    } catch (err: any) {
      const requestUrl = err?.config?.url ? `${err.config.baseURL || ''}${err.config.url}` : 'unknown';
      const method = err?.config?.method?.toUpperCase() || 'unknown';
      const errorCode = err?.code || 'no code';
      const errorMessage = err?.message || 'no message';
      let errorMsg = '';
      
      if (err?.response?.data?.message) {
        const key = err.response.data.message;
        errorMsg = t(key) !== key ? t(key) : key;
      } else if (err?.response?.data) {
        errorMsg = JSON.stringify(err.response.data);
      } else if (err?.response) {
        errorMsg = `Error ${err.response.status}: ${err.response.statusText}`;
      } else if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') {
        errorMsg = 'Network unavailable';
      } else if (err?.message && err.message !== 'Network Error') {
        errorMsg = err.message;
      } else {
        errorMsg = t('errors.generic');
      }
      
      setError(`${errorMsg} | ${method} ${requestUrl} | Code: ${errorCode} | ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
        {t('auth.register')}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <div ref={firstNameRef}>
          <Input
            label={t('auth.firstName')}
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setTouched(prev => ({ ...prev, firstName: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, firstName: true }))}
            error={showAllErrors || touched.firstName ? getVisibleErrors().firstName : undefined}
            required
          />
        </div>
        <div ref={lastNameRef}>
          <Input
            label={t('auth.lastName')}
            type="text"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              setTouched(prev => ({ ...prev, lastName: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, lastName: true }))}
            error={showAllErrors || touched.lastName ? getVisibleErrors().firstName : undefined}
            required
          />
        </div>
        <div ref={genderRef}>
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
            onChange={(value) => {
              setGender(value as Gender);
              setTouched(prev => ({ ...prev, gender: true }));
              if (value !== 'PREFER_NOT_TO_SAY') {
                setGenderAcknowledged(false);
              }
            }}
          />
          {gender === 'PREFER_NOT_TO_SAY' && (
            <div className="mt-3 flex items-start">
              <input
                type="checkbox"
                id="gender-ack-checkbox"
                checked={genderAcknowledged}
                onChange={(e) => {
                  setGenderAcknowledged(e.target.checked);
                  setTouched(prev => ({ ...prev, gender: true }));
                }}
                onBlur={() => setTouched(prev => ({ ...prev, gender: true }))}
                className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="gender-ack-checkbox" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {t('profile.preferNotToSayAcknowledgment')}
              </label>
            </div>
          )}
          {(showAllErrors || touched.gender) && getVisibleErrors().gender && (
            <p className="mt-1.5 text-sm text-red-500 dark:text-red-400">{getVisibleErrors().gender}</p>
          )}
        </div>
        <div ref={phoneRef}>
          <Input
            label={t('auth.phone')}
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setTouched(prev => ({ ...prev, phone: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
            placeholder="+1234567890"
            error={showAllErrors || touched.phone ? getVisibleErrors().phone : undefined}
            required
          />
        </div>
        <div ref={passwordRef}>
          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setTouched(prev => ({ ...prev, password: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
            error={showAllErrors || touched.password ? getVisibleErrors().password : undefined}
            required
          />
        </div>
        <div ref={passwordConfirmRef}>
          <Input
            label={t('auth.passwordConfirm') || 'Confirm Password'}
            type="password"
            value={passwordConfirm}
            onChange={(e) => {
              setPasswordConfirm(e.target.value);
              setTouched(prev => ({ ...prev, passwordConfirm: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, passwordConfirm: true }))}
            error={showAllErrors || touched.passwordConfirm ? getVisibleErrors().passwordConfirm : undefined}
            required
          />
        </div>
        <div ref={emailRef}>
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setTouched(prev => ({ ...prev, email: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
            error={showAllErrors || touched.email ? getVisibleErrors().email : undefined}
          />
        </div>
        <div ref={eulaRef} className="flex items-start">
          <input
            type="checkbox"
            id="eula-checkbox"
            checked={acceptedEula}
            onChange={(e) => {
              setAcceptedEula(e.target.checked);
              setTouched(prev => ({ ...prev, eula: true }));
            }}
            onBlur={() => setTouched(prev => ({ ...prev, eula: true }))}
            className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            required
          />
          <label htmlFor="eula-checkbox" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            {t('auth.acceptEula') || 'I agree to the'}{' '}
            <a
              href="/eula/world/eula.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors underline"
              onClick={(e) => {
                e.preventDefault();
                openEula();
              }}
            >
              {t('auth.eula') || 'Terms of Service'}
            </a>
          </label>
        </div>
        {(showAllErrors || touched.eula) && getVisibleErrors().eula && (
          <p className="text-sm text-red-500 dark:text-red-400">{getVisibleErrors().eula}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('app.loading') : t('auth.register')}
        </Button>
      </form>

      <p className="mt-6 text-center text-gray-600 dark:text-gray-400">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthLayout>
  );
};
