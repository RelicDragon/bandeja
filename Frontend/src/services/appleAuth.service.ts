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

// Actual Capacitor plugin response structure
interface CapacitorAppleSignInResponse {
  response: {
    user: string | null;         // User ID string
    email: string | null;
    givenName: string | null;    // First name
    familyName: string | null;   // Last name
    identityToken: string;
    authorizationCode: string;
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

function extractAppleNames(responseData: any): { firstName?: string; lastName?: string } {
  // Names come directly from the Capacitor plugin response object
  // The plugin returns: { response: { givenName, familyName, ... } }
  if (!responseData || typeof responseData !== 'object') {
    return {};
  }

  const firstName = responseData.givenName || undefined;
  const lastName = responseData.familyName || undefined;

  return { firstName, lastName };
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
    }) as CapacitorAppleSignInResponse;
    
    console.log('[APPLE_AUTH] Apple authorization response received:', {
      hasResponse: !!result.response,
      hasIdentityToken: !!result.response?.identityToken,
      identityTokenLength: result.response?.identityToken?.length || 0,
      userId: result.response?.user || null,
      email: result.response?.email || null,
      givenName: result.response?.givenName || null,
      familyName: result.response?.familyName || null,
    });

    if (!result.response?.identityToken) {
      console.error('[APPLE_AUTH] No identity token received from Apple');
      throw new Error('No identity token received from Apple');
    }
    console.log('[APPLE_AUTH] Identity token received, length:', result.response.identityToken.length);

    // Extract names from response (givenName, familyName are directly on response object)
    const { firstName: extractedFirstName, lastName: extractedLastName } = extractAppleNames(result.response);
    
    console.log('[APPLE_AUTH] Extracted names from Apple response:', {
      extractedFirstName: extractedFirstName || null,
      extractedLastName: extractedLastName || null,
      firstNameLength: extractedFirstName?.length || 0,
      lastNameLength: extractedLastName?.length || 0,
    });
    
    // Email is also directly on response object
    const normalizedUser = {
      email: result.response.email || undefined,
      name: extractedFirstName || extractedLastName ? {
        firstName: extractedFirstName,
        lastName: extractedLastName,
      } : undefined,
    };
    
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
