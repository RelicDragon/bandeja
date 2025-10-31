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
  method: 'TELEGRAM' | 'SMS';
}



export const LundaAccountModal: React.FC<LundaAccountModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+7');
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = [
    'Номер телефона',
    'Авторизация',
    'Код подтверждения',
    'Получение данных',
    'Завершение'
  ];

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

  const solveCaptcha = (captchaData: CaptchaData): string => {
    const op1 = parseInt(captchaData.operand1);
    const op2 = parseInt(captchaData.operand2);
    
    switch (captchaData.operation) {
      case '+':
        return String(op1 + op2);
      case '-':
        return String(op1 - op2);
      case '*':
        return String(op1 * op2);
      case '/':
        return String(Math.floor(op1 / op2));
      default:
        return String(op1 + op2);
    }
  };

  const handleStartAuth = async () => {
    setLoading(true);
    setError('');

    try {
      const captchaResponse = await lundaApi.getCaptcha({
        countryCode: countryCode,
        phone: phone,
      });

      const captchaResult = captchaResponse.result;
      setCaptcha(captchaResult);
      
      const answer = solveCaptcha(captchaResult);
      setCaptchaAnswer(answer);

      const response = await lundaApi.sendCode({
        countryCode: countryCode,
        phone: phone,
        answer: answer,
        method: 'TELEGRAM',
        ticket: captchaResult.ticket,
      });

      setAuthData({
        temporalToken: response.result.temporalToken,
        method: response.result.method,
      });
      setCurrentStep(2);
    } catch (err: any) {
      setError('Ошибка авторизации: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };


  const handleAuthSubmit = async () => {
    if (code.length !== 4) {
      setError('Введите 4-значный код');
      return;
    }

    if (!authData?.temporalToken) {
      setError('Temporal token не найден');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await lundaApi.auth({
        phone: phone,
        code: code,
        temporalToken: authData.temporalToken,
        countryCode: countryCode,
      });

      if (response.cookie) {
        localStorage.setItem('lundaCookie', response.cookie);
      }

      setCurrentStep(3);
    } catch (err: any) {
      setError('Ошибка авторизации: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleGetData = async () => {
    setLoading(true);
    setError('');

    try {
      await lundaApi.getProfile({});
      setCurrentStep(4);
    } catch (err: any) {
      setError('Ошибка получения данных: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
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
              <Input
                type="text"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.replace(/[^+0-9]/g, ''))}
                placeholder="+7"
                className="w-20"
                maxLength={5}
              />
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
              {loading ? 'Отправка кода в Telegram...' : 'Начать авторизацию'}
            </Button>
          </div>
        );

      case 2: // Code entry
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {authData?.method === 'SMS' ? 'Введите код подтверждения' : 'Введите код из Telegram'}
              </h3>
              {captcha && authData?.method === 'TELEGRAM' && (
                <div className="mb-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Капча решена автоматически:
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {captcha.operand1} {captcha.operation} {captcha.operand2} = {captchaAnswer}
                  </p>
                </div>
              )}
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {authData?.method === 'SMS' ? (
                  'Введите код, отправленный на телефон'
                ) : (
                  <>
                    Откройте <a
                      href="https://t.me/VerificationCodes"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      @VerificationCodes
                    </a> и скопируйте 4-значный код
                  </>
                )}
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

      case 3: // Get player data
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

      case 4: // Success
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
