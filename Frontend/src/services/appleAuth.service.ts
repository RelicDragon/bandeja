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
  console.log('[APPLE_AUTH] Starting Apple sign-in process');
  
  if (!isIOS()) {
    console.log('[APPLE_AUTH] Not iOS device, returning null');
    return null;
  }

  try {
    console.log('[APPLE_AUTH] Generating nonce');
    const nonce = generateNonce();
    console.log('[APPLE_AUTH] Nonce generated:', nonce.substring(0, 8) + '...');
    
    console.log('[APPLE_AUTH] Hashing nonce');
    const hashedNonce = await sha256(nonce);
    console.log('[APPLE_AUTH] Hashed nonce:', hashedNonce.substring(0, 16) + '...');

    console.log('[APPLE_AUTH] Calling SignInWithApple.authorize with clientId:', config.appleClientId);
    const result = await SignInWithApple.authorize({
      clientId: config.appleClientId,
      redirectURI: 'https://bandeja.me',
      scopes: 'email name',
      state: nonce,
      nonce: hashedNonce,
    });
    console.log('[APPLE_AUTH] Apple authorization response received - full response structure:', JSON.stringify({
      response: result.response ? {
        identityToken: result.response.identityToken ? '[REDACTED - length: ' + result.response.identityToken.length + ']' : undefined,
        authorizationCode: result.response.authorizationCode ? '[REDACTED - length: ' + result.response.authorizationCode.length + ']' : undefined,
        user: result.response.user,
      } : undefined,
    }, null, 2));
    console.log('[APPLE_AUTH] Apple authorization response details:', {
      hasResponse: !!result.response,
      hasIdentityToken: !!result.response?.identityToken,
      hasAuthorizationCode: !!result.response?.authorizationCode,
      identityTokenLength: result.response?.identityToken?.length || 0,
      identityTokenPreview: result.response?.identityToken ? result.response.identityToken.substring(0, 50) + '...' : undefined,
      authorizationCodeLength: result.response?.authorizationCode?.length || 0,
      authorizationCodePreview: result.response?.authorizationCode ? result.response.authorizationCode.substring(0, 50) + '...' : undefined,
      hasUser: !!result.response?.user,
      userType: typeof result.response?.user,
      userEmail: result.response?.user && typeof result.response.user === 'object' && !Array.isArray(result.response.user) ? (result.response.user as any).email : undefined,
      userName: result.response?.user && typeof result.response.user === 'object' && !Array.isArray(result.response.user) ? (result.response.user as any).name : undefined,
      userFirstName: result.response?.user && typeof result.response.user === 'object' && !Array.isArray(result.response.user) && (result.response.user as any).name ? (result.response.user as any).name.firstName : undefined,
      userLastName: result.response?.user && typeof result.response.user === 'object' && !Array.isArray(result.response.user) && (result.response.user as any).name ? (result.response.user as any).name.lastName : undefined,
    });

    if (!result.response?.identityToken) {
      console.error('[APPLE_AUTH] No identity token received from Apple');
      throw new Error('No identity token received from Apple');
    }
    console.log('[APPLE_AUTH] Identity token received, length:', result.response.identityToken.length);

    const userData = result.response.user;
    console.log('[APPLE_AUTH] Raw userData from Apple:', {
      userDataType: typeof userData,
      isObject: typeof userData === 'object',
      isNull: userData === null,
      isArray: Array.isArray(userData),
      rawUserData: userData,
      hasEmail: userData && typeof userData === 'object' && !Array.isArray(userData) ? !!(userData as any).email : false,
      hasName: userData && typeof userData === 'object' && !Array.isArray(userData) ? !!(userData as any).name : false,
      nameType: userData && typeof userData === 'object' && !Array.isArray(userData) ? typeof (userData as any).name : 'N/A',
      nameValue: userData && typeof userData === 'object' && !Array.isArray(userData) ? (userData as any).name : 'N/A',
    });
    
    const normalizedUser = typeof userData === 'object' && userData !== null && !Array.isArray(userData)
      ? {
          email: (userData as any).email,
          name: (userData as any).name ? {
            firstName: (userData as any).name?.firstName,
            lastName: (userData as any).name?.lastName,
          } : undefined,
        }
      : {};
    
    console.log('[APPLE_AUTH] Extracting firstName/lastName from Apple response:', {
      rawNameObject: userData && typeof userData === 'object' && !Array.isArray(userData) ? (userData as any).name : null,
      extractedFirstName: normalizedUser.name?.firstName || null,
      extractedLastName: normalizedUser.name?.lastName || null,
      firstNameLength: normalizedUser.name?.firstName?.length || 0,
      lastNameLength: normalizedUser.name?.lastName?.length || 0,
    });
    
    console.log('[APPLE_AUTH] User data normalized:', {
      hasEmail: !!normalizedUser.email,
      email: normalizedUser.email || null,
      hasFirstName: !!normalizedUser.name?.firstName,
      firstName: normalizedUser.name?.firstName || null,
      hasLastName: !!normalizedUser.name?.lastName,
      lastName: normalizedUser.name?.lastName || null,
    });

    console.log('[APPLE_AUTH] Apple sign-in successful');
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
    
    console.error('[APPLE_AUTH] Error during Apple sign-in:', {
      message: errorMessage,
      code: errorCode,
      errorString,
    });
    
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
      console.log('[APPLE_AUTH] User cancelled Apple sign-in');
      return null; // Silently handle cancellation - no error shown
    }
    console.error('[APPLE_AUTH] Throwing error:', error);
    throw error;
  }
}
