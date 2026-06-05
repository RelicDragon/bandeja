#!/usr/bin/env ts-node
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { generateShortAccessToken } from '../../src/utils/jwt';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ADMIN_USER_ID = 'cmharv9no000165fffjxlu6vt';
const CLUB_ID = 'cmhavpbt8000265s4wsulhivd';
const BASE = 'http://localhost:3000/api/club-admin';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

async function get(path: string, userId: string) {
  const token = generateShortAccessToken({ userId });
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { success?: boolean; data?: unknown };
  return { status: res.status, json };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const list = await get('/clubs', ADMIN_USER_ID);
  assert(list.status === 200, `list clubs -> ${list.status}`);
  assert(Array.isArray(list.json.data), 'list clubs data is array');
  console.log('ok: GET /clubs');

  const club = await get(`/clubs/${CLUB_ID}`, ADMIN_USER_ID);
  assert(club.status === 200, `get club -> ${club.status}`);
  console.log('ok: GET /clubs/:id');

  const courts = await get(`/clubs/${CLUB_ID}/courts`, ADMIN_USER_ID);
  assert(courts.status === 200, `list courts -> ${courts.status}`);
  assert(Array.isArray(courts.json.data), 'courts data is array');
  console.log('ok: GET /clubs/:id/courts');

  const schedule = await get(`/clubs/${CLUB_ID}/schedule?date=${today}`, ADMIN_USER_ID);
  assert(schedule.status === 200, `schedule -> ${schedule.status}`);
  const schedData = schedule.json.data as { slots?: unknown[]; conflicts?: unknown[] };
  assert(Array.isArray(schedData.slots), 'schedule slots array');
  console.log('ok: GET /clubs/:id/schedule');

  const stranger = await get(`/clubs/${CLUB_ID}`, 'cmko17zxm003365x6ibtlt4nw');
  assert(stranger.status === 200, 'other club admin can access shared club');
  console.log('ok: shared club admin access');

  console.log('club-admin-http.smoke: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
