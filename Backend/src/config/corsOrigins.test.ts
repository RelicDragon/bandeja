import {
  createCorsOriginDelegate,
  DEV_CORS_ORIGINS,
  getCorsAllowedOrigins,
  isCorsOriginAllowed,
  PROD_CORS_ORIGINS,
} from './corsOrigins';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

const prod = getCorsAllowedOrigins({ nodeEnv: 'production' });
for (const o of PROD_CORS_ORIGINS) {
  assert(prod.includes(o), `prod allowlist must include ${o}`);
}
assert(!prod.includes('http://localhost:3001'), 'prod must not include Vite localhost');
assert(!prod.includes('http://91.98.232.51'), 'prod must not include legacy IP');
assert(!prod.includes('null'), 'prod must not allow null origin string');

const dev = getCorsAllowedOrigins({
  nodeEnv: 'development',
  frontendUrl: 'http://localhost:3001/',
});
for (const o of DEV_CORS_ORIGINS) {
  assert(dev.includes(o), `dev allowlist must include ${o}`);
}
assert(dev.includes('http://localhost:3001'), 'frontendUrl trailing slash normalized');
assert(dev.includes('http://127.0.0.1:9010'), 'dev must allow Admin serve origin');

const withExtra = getCorsAllowedOrigins({
  nodeEnv: 'production',
  extraOrigins: ' https://staging.example.com , http://evil.example/',
});
assert(withExtra.includes('https://staging.example.com'), 'extra origins from env');
assert(withExtra.includes('http://evil.example'), 'extra origin trailing slash stripped');

assert(isCorsOriginAllowed('https://bandeja.me', prod), 'bandeja.me allowed');
assert(isCorsOriginAllowed('https://localhost', prod), 'Capacitor Android allowed');
assert(isCorsOriginAllowed('capacitor://localhost', prod), 'Capacitor iOS allowed');
assert(!isCorsOriginAllowed('null', prod), 'Origin null rejected');
assert(!isCorsOriginAllowed(undefined, prod), 'missing origin not “allowed” for reflect');
assert(!isCorsOriginAllowed('https://evil.example', prod), 'arbitrary origin rejected');

const delegate = createCorsOriginDelegate(prod);
function decide(origin: string | undefined): boolean {
  let result: boolean | undefined;
  delegate(origin, (_err, allow) => {
    result = allow;
  });
  return result === true;
}
assert(decide(undefined) === true, 'no Origin → allow (non-browser / same-origin)');
assert(decide('https://bandeja.me') === true, 'delegate allows bandeja.me');
assert(decide('null') === false, 'delegate rejects Origin null');
assert(decide('https://attacker.test') === false, 'delegate rejects unknown');

console.log('corsOrigins.test.ts: ok');
