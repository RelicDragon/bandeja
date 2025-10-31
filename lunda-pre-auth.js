#!/usr/bin/env node

const readline = require('readline');

const LUNDA_BASE_URL = 'https://app.lundapadel.ru/api';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
};

const makeLundaRequest = async (endpoint, method, body, headers = {}) => {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const config = {
    method,
    headers: defaultHeaders,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${LUNDA_BASE_URL}${endpoint}`, config);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Lunda API error: ${response.status} ${errorText}`);
  }

  return await response.json();
};

const calculateCaptcha = (operand1, operand2, operation) => {
  const num1 = parseInt(operand1);
  const num2 = parseInt(operand2);
  
  switch (operation) {
    case '+':
      return num1 + num2;
    case '-':
      return num1 - num2;
    case '*':
      return num1 * num2;
    case '/':
      return Math.floor(num1 / num2);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
};

async function main() {
  console.log('=== Lunda Pre-Authentication ===\n');

  let phone = '';
  let captcha = null;
  let authData = null;

  try {
    console.log('Step 1: Введите номер телефона');
    console.log('Номер должен начинаться с 9 и содержать 10 цифр (например: 9672825552)\n');
    
    while (true) {
      const input = await question('Введите номер телефона: ');
      const cleaned = input.replace(/\D/g, '').slice(0, 10);
      
      const phoneRegex = /^9\d{9}$/;
      if (phoneRegex.test(cleaned)) {
        phone = cleaned;
        break;
      }
      console.log('Неверный формат. Номер должен начинаться с 9 и содержать 10 цифр');
    }

    console.log(`\n✓ Номер телефона: +7${phone}\n`);

    console.log('Step 2: Получение капчи...\n');
    
    const captchaResponse = await makeLundaRequest('/player/captcha', 'PUT', {
      parameters: {
        countryCode: '+7',
        phone: phone,
      }
    });

    captcha = captchaResponse.result;
    console.log(`✓ Капча получена: ${captcha.operand1} ${captcha.operation} ${captcha.operand2} = ?\n`);

    console.log('Step 3: Решение капчи');
    const captchaAnswer = calculateCaptcha(captcha.operand1, captcha.operand2, captcha.operation);
    console.log(`✓ Ответ: ${captchaAnswer}\n`);

    console.log('Step 4: Отправка кода в Telegram...\n');
    
    const sendCodeResponse = await makeLundaRequest('/player/send-code', 'POST', {
      parameters: {
        countryCode: '+7',
        phone: phone,
        answer: captchaAnswer.toString(),
        method: 'TELEGRAM',
        ticket: captcha.ticket,
      }
    });

    authData = sendCodeResponse.result;
    console.log('✓ Код отправлен в Telegram');
    console.log('Откройте @VerificationCodes и скопируйте 4-значный код\n');

    let code = '';
    while (true) {
      const input = await question('Введите 4-значный код из Telegram: ');
      const cleaned = input.replace(/\D/g, '').slice(0, 4);
      
      if (cleaned.length === 4) {
        code = cleaned;
        break;
      }
      console.log('Введите 4-значный код');
    }

    console.log('\n');

    const authBody = {
      parameters: {
        countryCode: '+7',
        phone: phone,
        code: code,
        temporalToken: authData.temporalToken,
        method: 'TELEGRAM',
      }
    };

    console.log('\n=== Auth Request Body ===\n');
    console.log(JSON.stringify(authBody, null, 2));
    console.log('\n=== Copy the above JSON and use it in lunda-auth.js ===\n');

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();


