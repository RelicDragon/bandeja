import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const validation of validations) {
      await validation.run(req);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[validate] Validation errors:', errors.array());
      const errorMessages = errors.array().map(err => {
        const field = 'param' in err ? err.param : 'field' in err ? err.field : 'unknown';
        return `${field}: ${err.msg}`;
      }).join(', ');
      return next(new ApiError(400, errorMessages));
    }

    if (config.nodeEnv === 'development') {
      console.log('[validate] Validation passed');
    }
    next();
  };
};

