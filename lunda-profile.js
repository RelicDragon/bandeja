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

async function main() {
  console.log('=== Lunda Profile ===\n');

  try {
    console.log('Вставьте Set-Cookie значение из lunda-auth.js\n');
    
    const cookie = await question('Введите cookie: ');
    
    if (!cookie.trim()) {
      throw new Error('Пустой cookie');
    }

    console.log('\nПолучаю данные профиля...\n');
    
    const playerResponse = await makeLundaRequest('/player/current', 'GET', undefined, {
      Cookie: cookie.trim(),
    });

    const playerData = playerResponse.result;

    console.log('\n=== Player Profile Data ===\n');
    console.log(JSON.stringify(playerData, null, 2));
    console.log('\n');

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


