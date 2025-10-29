import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { Button, Input, OTPInput } from '@/components';
import { lundaApi } from '@/api';

interface LundaAccountModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface CaptchaData {
  operand1: string;
  operand2: string;
  ticket: string;
  operation: string;
}

interface AuthData {
  temporalToken: string;
}

interface PlayerData {
  gender: string;
  displayName: string;
  shareLink: string;
  leftSide: boolean;
  identity: {
    uid: string;
  };
  countryCode: string;
  displayRating: string;
  rightSide: boolean;
  phone: string;
  nameInitials: string;
}

const LUNDA_BASE_URL = 'https://app.lundapadel.ru/api';

export const LundaAccountModal: React.FC<LundaAccountModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = [
    'Номер телефона',
    'Авторизация',
    'Капча',
    'Код подтверждения',
    'Получение данных',
    'Завершение'
  ];

  const makeLundaRequest = async (endpoint: string, method: string, body?: any, headers?: any): Promise<any> => {
    const defaultHeaders = {
      //'X-App-Version': '65',
      //'X-Current-App-Page': 'main',
      //'X-Request-ID': generateRequestId(),
      'Content-Type': 'application/json',
      ...headers,
    };

    const config: RequestInit = {
      method,
      headers: defaultHeaders,
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${LUNDA_BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      throw new Error(`Lunda API error: ${response.status}`);
    }

    return response.json();
  };

  const handlePhoneSubmit = () => {
    // Validate phone: +7, 10 digits after +7, first digit is 9
    const phoneRegex = /^9\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setError('Неверный формат номера. Должен начинаться с 9 и содержать 10 цифр');
      return;
    }

    setError('');
    setCurrentStep(1);
  };

  const handleStartAuth = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await makeLundaRequest('/player/captcha', 'PUT', {
        parameters: {
          countryCode: '+7',
          phone: phone,
        }
      });

      setCaptcha(response.result);
      setCurrentStep(2);
    } catch (err: any) {
      setError('Ошибка получения капчи: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCaptchaSubmit = async () => {
    if (!captcha || !captchaAnswer.trim()) {
      setError('Введите ответ на капчу');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await makeLundaRequest('/player/send-code', 'POST', {
        parameters: {
          countryCode: '+7',
          phone: phone,
          answer: captchaAnswer.trim(),
          method: 'TELEGRAM',
          ticket: captcha.ticket,
        }
      });

      setAuthData(response.result);
      setCurrentStep(3);
    } catch (err: any) {
      setError('Ошибка отправки кода: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async () => {
    if (code.length !== 4) {
      setError('Введите 4-значный код');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await makeLundaRequest('/player/auth', 'POST', {
        parameters: {
          countryCode: '+7',
          phone: phone,
          code: code,
          temporalToken: authData?.temporalToken,
          method: 'TELEGRAM',
        }
      });

      if (response.result.status !== 'SUCCESSFUL') {
        throw new Error('Авторизация не удалась');
      }

      // Extract cookie from response headers
      const cookie = response.headers?.['set-cookie'] || response.headers?.['Set-Cookie'];
      
      if (cookie) {
        localStorage.setItem('lundaCookie', cookie);
      }

      setCurrentStep(4);
    } catch (err: any) {
      setError('Ошибка авторизации: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGetData = async () => {
    setLoading(true);
    setError('');

    try {
      const cookie = localStorage.getItem('lundaCookie');
      if (!cookie) {
        throw new Error('Cookie не найден');
      }

      const response = await makeLundaRequest('/player/current', 'GET', undefined, {
        Cookie: cookie,
      });

      await saveLundaData(response.result);
      setCurrentStep(5);
    } catch (err: any) {
      setError('Ошибка получения данных: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveLundaData = async (data: PlayerData) => {
    try {
      await lundaApi.syncProfile({
        phone: `+${data.countryCode}${data.phone}`,
        gender: data.gender === 'MAN' ? 'MALE' : data.gender === 'WOMAN' ? 'FEMALE' : 'PREFER_NOT_TO_SAY',
        level: parseFloat(data.displayRating),
        preferredCourtSideLeft: data.leftSide,
        preferredCourtSideRight: data.rightSide,
        metadata: data,
      });
    } catch (err: any) {
      console.error('Error saving Lunda data:', err);
      throw new Error('Ошибка сохранения данных');
    }
  };

  const handleFinish = () => {
    localStorage.removeItem('lundaCookie');
    onSuccess();
  };

  const handleClose = () => {
    localStorage.removeItem('lundaCookie');
    onClose();
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Phone input
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Введите номер телефона
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Номер должен начинаться с 9 и содержать 10 цифр
              </p>
            </div>

            <div className="flex gap-2">
              <div className="flex items-center justify-center w-16 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg font-medium text-gray-900 dark:text-white">
                +7
              </div>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9672825552"
                className="flex-1"
                maxLength={10}
              />
            </div>

            <Button
              onClick={handlePhoneSubmit}
              className="w-full"
              disabled={phone.length !== 10 || !phone.startsWith('9')}
            >
              Продолжить
            </Button>
          </div>
        );

      case 1: // Start authorization
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Авторизация в Lunda
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Нажмите кнопку для начала авторизации
              </p>
            </div>

            <Button
              onClick={handleStartAuth}
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Получение капчи...' : 'Начать авторизацию'}
            </Button>
          </div>
        );

      case 2: // Captcha solving
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Решите капчу
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {captcha?.operand1} {captcha?.operation} {captcha?.operand2} = ?
              </p>
            </div>

            <Input
              type="number"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              placeholder="Ответ"
              className="text-center text-xl"
            />

            <Button
              onClick={handleCaptchaSubmit}
              className="w-full"
              disabled={loading || !captchaAnswer.trim()}
            >
              {loading ? 'Отправка кода...' : 'Получить код в Telegram'}
            </Button>
          </div>
        );

      case 3: // Code entry
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Введите код из Telegram
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Откройте <a
                  href="https://t.me/VerificationCodes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 dark:text-primary-400 hover:underline"
                >
                  @VerificationCodes
                </a> и скопируйте 4-значный код
              </p>
            </div>

            <OTPInput
              value={code}
              onChange={setCode}
              length={4}
              disabled={loading}
            />

            <Button
              onClick={handleAuthSubmit}
              className="w-full"
              disabled={loading || code.length !== 4}
            >
              {loading ? 'Авторизация...' : 'Авторизоваться'}
            </Button>
          </div>
        );

      case 4: // Get player data
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Авторизация успешна
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Получаем информацию о профиле...
              </p>
            </div>

            <Button
              onClick={handleGetData}
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Получение данных...' : 'Получить данные игрока'}
            </Button>
          </div>
        );

      case 5: // Success
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                Данные успешно обновлены!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Информация из Lunda была синхронизирована с вашим профилем.
              </p>
            </div>

            <Button
              onClick={handleFinish}
              className="w-full"
            >
              Завершить
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Подключение Lunda
          </h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            {steps.slice(0, -1).map((_, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index <= currentStep
                    ? 'bg-primary-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {renderStepContent()}
        </div>
      </div>
    </div>,
    document.body
  );
};
