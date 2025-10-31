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

  const data = await response.json();
  
  let setCookie = response.headers.get('set-cookie') || response.headers.get('Set-Cookie');
  if (Array.isArray(setCookie)) {
    setCookie = setCookie[0];
  }
  
  return {
    data,
    cookie: setCookie
  };
};

async function main() {
  console.log('=== Lunda Authentication ===\n');

  try {
    console.log('Вставьте JSON body из lunda-pre-auth.js\n');
    console.log('Скопируйте и вставьте весь JSON блок:\n');
    
    const jsonInput = await question('');

    if (!jsonInput.trim()) {
      throw new Error('Пустой JSON');
    }

    const authBody = JSON.parse(jsonInput.trim());
    
    console.log('\nВыполняю авторизацию...\n');
    
    const authResponse = await makeLundaRequest('/player/auth', 'POST', authBody);

    if (authResponse.data.result.status !== 'SUCCESSFUL') {
      throw new Error('Авторизация не удалась');
    }

    const setCookie = authResponse.cookie;
    
    if (!setCookie) {
      throw new Error('Set-Cookie header не получен');
    }

    console.log('\n✓ Авторизация успешна\n');
    console.log('=== Set-Cookie Header ===\n');
    console.log(setCookie);
    console.log('\n=== Copy the above cookie and use it in lunda-profile.js ===\n');

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
