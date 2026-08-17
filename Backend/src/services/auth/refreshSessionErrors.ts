import { ApiError } from '../../utils/ApiError';

export function refreshAuthError(code: string, statusCode = 401): never {
  throw new ApiError(statusCode, code, true, { code });
}
