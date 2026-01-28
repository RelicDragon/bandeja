import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'padelpulse',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    schema: process.env.DB_SCHEMA || 'public',
  },
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '90d',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apns: {
    keyId: process.env.APNS_KEY_ID || '',
    teamId: process.env.APNS_TEAM_ID || '',
    bundleId: process.env.APNS_BUNDLE_ID || 'com.funified.bandeja',
    keyPath: process.env.APNS_KEY_PATH || '',
    production: process.env.APNS_PRODUCTION === 'true',
  },
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'eu-central-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'bandeja-padel-eu',
    cloudFrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || 'd1afylun4w6qxe.cloudfront.net',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  abstractApi: {
    apiKey: process.env.ABSTRACT_API_KEY || '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || 'com.funified.bandeja',
  },
  google: {
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
    iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
    androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  },
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  },
};

