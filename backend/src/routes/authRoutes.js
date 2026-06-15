import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import {
  register,
  registerValidation,
  kycQuestions,
  kycQuestionsValidation,
  login,
  refresh,
  logout,
  me,
  passwordReset,
  passwordResetConfirm,
  resendVerification,
  resendVerificationValidation,
  verifyEmailCodeHandler,
  verifyEmailCodeValidation,
  emailVerify,
  emailVerifyRedirect,
} from '../controllers/authController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit code-verification attempts to make brute-forcing the 6-digit code infeasible.
const codeVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

router.post('/register/', registerValidation, validate, register);
router.post('/kyc/questions/', kycQuestionsValidation, validate, kycQuestions);
router.post('/login/', loginLimiter, body('email').isEmail(), body('password').notEmpty(), validate, login);
router.post('/token/refresh/', refresh);
router.post('/logout/', logout);
router.get('/me/', authenticate, me);
router.patch('/me/', authenticate, body('first_name').optional().trim().notEmpty(), body('last_name').optional().trim().notEmpty(), validate, async (req, res, next) => {
  try {
    const { updateUserProfile } = await import('../services/authService.js');
    const user = updateUserProfile(req.user.id, req.body);
    res.json(user);
  } catch (error) {
    next(error);
  }
});
router.post('/password-reset/', resetLimiter, body('email').isEmail(), validate, passwordReset);
router.post('/password-reset/confirm/', body('token').notEmpty(), body('new_password').isLength({ min: 8 }), validate, passwordResetConfirm);
router.post('/resend-verification/', resetLimiter, resendVerificationValidation, validate, resendVerification);
router.post('/verify-email-code/', codeVerifyLimiter, verifyEmailCodeValidation, validate, verifyEmailCodeHandler);
router.post('/verify-email/:token/', emailVerify);
router.get('/verify-email/:token/', emailVerifyRedirect);
router.get('/users/', authenticate, requireRoles('ADMIN'), async (req, res, next) => {
  try {
    const { listAdminUsers } = await import('../services/adminService.js');
    const users = listAdminUsers(req.query);
    res.json({ results: users });
  } catch (error) {
    next(error);
  }
});

export default router;
