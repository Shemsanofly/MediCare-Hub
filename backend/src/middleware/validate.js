import { validationResult } from 'express-validator';
import { ValidationError } from '../utils/errors.js';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => `${e.path}: ${e.msg}`).join('; ');
    return next(new ValidationError(messages, 'VALIDATION_ERROR'));
  }
  next();
}
