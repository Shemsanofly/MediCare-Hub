export class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, code, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation error', code = 'VALIDATION_ERROR') {
    super(message, code, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, code, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN') {
    super(message, code, 403);
  }
}

export function errorResponse(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message,
      detail: error.message,
      code: error.code,
    });
  }

  console.error('Unhandled error:', error);
  return res.status(500).json({
    error: 'Internal server error',
    detail: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
