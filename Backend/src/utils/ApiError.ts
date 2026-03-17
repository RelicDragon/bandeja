export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;
  data?: Record<string, unknown>;

  constructor(statusCode: number, message: string, isOperational = true, data?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

