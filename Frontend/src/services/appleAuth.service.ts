import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { isIOS } from '@/utils/capacitor';
import { config } from '@/config/media';

export interface AppleAuthResult {
  identityToken: string;
  authorizationCode: string;
  user: {
    email?: string;
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signInWithApple(): Promise<{ result: AppleAuthResult; nonce: string } | null> {
  if (!isIOS()) {
    return null;
  }

  try {
    const nonce = generateNonce();
    const hashedNonce = await sha256(nonce);

    const result = await SignInWithApple.authorize({
      clientId: config.appleClientId,
      redirectURI: 'https://bandeja.me',
      scopes: 'email name',
      state: nonce,
      nonce: hashedNonce,
    });

    if (!result.response?.identityToken) {
      throw new Error('No identity token received from Apple');
    }

    const userData = result.response.user;
    const normalizedUser = typeof userData === 'object' && userData !== null && !Array.isArray(userData)
      ? {
          email: (userData as any).email,
          name: (userData as any).name ? {
            firstName: (userData as any).name?.firstName,
            lastName: (userData as any).name?.lastName,
          } : undefined,
        }
      : {};

    return {
      result: {
        identityToken: result.response.identityToken,
        authorizationCode: result.response.authorizationCode || '',
        user: normalizedUser,
      },
      nonce,
    };
  } catch (error: any) {
    const errorMessage = error?.message || error?.code || '';
    const errorCode = error?.code || error?.errorCode || '';
    const errorString = String(errorMessage) + String(errorCode);
    
    // Check for cancellation patterns including error 1001
    const canceledMessages = [
      'User canceled',
      'canceled',
      'cancelled',
      'user_cancelled',
      'user_cancel',
      '1001', // Apple's cancellation error code
      'error 1001',
      'operation couldn\'t be completed',
    ];
    
    const isCancelled = canceledMessages.some(msg => 
      errorString.toLowerCase().includes(msg.toLowerCase())
    );
    
    if (isCancelled) {
      return null; // Silently handle cancellation - no error shown
    }
    throw error;
  }
}
