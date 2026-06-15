import { body } from 'express-validator';
import { registerUser, loginUser, refreshAccessToken, logoutUser, requestPasswordReset, confirmPasswordReset, verifyEmail, verifyEmailCode, createEmailVerificationToken, resendVerificationEmail } from '../services/authService.js';
import { generateKycChallenge } from '../services/kycService.js';
import { sendVerificationEmail } from '../services/emailService.js';
import { errorResponse } from '../utils/errors.js';
import { env } from '../config/env.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/api/v1/auth/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const registerValidation = [
  // Keep the address as the user typed it (don't strip Gmail dots, etc.) so the
  // exact email is preserved for delivery and login.
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
  body('password').isString().isLength({ min: 8 }),
  body('first_name').isString().trim().notEmpty(),
  body('last_name').isString().trim().notEmpty(),
  body('role').isIn(['HOSPITAL', 'SUPPLIER']),
  body('organisation_name').isString().trim().notEmpty(),
  body('organisation_type').isIn(['HOSPITAL', 'SUPPLIER', 'PHARMACY', 'LAB']),
  body('nida_id').optional().isString().trim(),
  body('kyc_answers').optional().isObject(),
];

export async function register(req, res, next) {
  try {
    // Public registrations enforce NIDA KYC for suppliers.
    const user = registerUser(req.body, { enforceKyc: true });
    // Send the email verification link + 6-digit code (fire-and-forget).
    const { token, code } = createEmailVerificationToken(user.id);
    void sendVerificationEmail(user, token, code);
    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
}

export const kycQuestionsValidation = [body('nida_id').isString().trim().notEmpty()];

export async function kycQuestions(req, res, next) {
  try {
    res.json(generateKycChallenge(req.body.nida_id));
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const result = loginUser({
      email: req.body.email,
      password: req.body.password,
      ip_address: req.ip,
    });

    res.cookie('refresh_token', result.refresh, COOKIE_OPTIONS);
    res.json({ access: result.access, user: result.user });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refresh_token || req.body?.refresh;
    const access = refreshAccessToken(token);
    res.json({ access });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies.refresh_token;
    logoutUser(token);
    res.clearCookie('refresh_token', { ...COOKIE_OPTIONS, maxAge: 0 });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    res.json(req.user);
  } catch (error) {
    next(error);
  }
}

export async function passwordReset(req, res, next) {
  try {
    const result = requestPasswordReset(req.body.email);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function passwordResetConfirm(req, res, next) {
  try {
    const result = confirmPasswordReset(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export const resendVerificationValidation = [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
];

export async function resendVerification(req, res, next) {
  try {
    const result = resendVerificationEmail(req.body.email);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function emailVerify(req, res, next) {
  try {
    const result = verifyEmail(req.params.token);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export const verifyEmailCodeValidation = [
  body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
  body('code').isString().trim().matches(/^\d{6}$/).withMessage('Enter the 6-digit code'),
];

export async function verifyEmailCodeHandler(req, res, next) {
  try {
    const result = verifyEmailCode(req.body.email, req.body.code);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/** GET version for the link in the verification email — verifies then redirects. */
export async function emailVerifyRedirect(req, res) {
  let verified = false;
  try {
    verifyEmail(req.params.token);
    verified = true;
  } catch {
    verified = false;
  }

  // Render a self-contained, mobile-friendly confirmation page. Verification is
  // already done server-side above, so it works in whatever browser the email
  // link opens in (including Gmail's in-app browser) — the user can then open
  // the app in their normal browser to sign in.
  const loginUrl = `${env.SMTP.appBaseUrl}/login?verified=${verified ? '1' : '0'}`;
  const title = verified ? 'Email verified' : 'Verification link invalid';
  const icon = verified ? '✅' : '⚠️';
  const message = verified
    ? 'Your MediCare Hub account is now active. Open the app and sign in to get started.'
    : 'This verification link is invalid or has expired. Open the app and request a new verification email from the sign-in screen.';
  const accent = verified ? '#16a34a' : '#d97706';

  res
    .status(verified ? 200 : 400)
    .type('html')
    .send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title} · MediCare Hub</title>
</head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">
    <div style="width:100%;max-width:420px;background:#fff;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,.08);overflow:hidden">
      <div style="background:#1B4F8C;padding:18px 24px;color:#fff;font-weight:700;font-size:16px">MediCare Hub</div>
      <div style="padding:32px 24px;text-align:center">
        <div style="font-size:48px;line-height:1;margin-bottom:12px">${icon}</div>
        <h1 style="margin:0 0 10px;font-size:20px;color:#111827">${title}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563">${message}</p>
        <a href="${loginUrl}" style="display:block;background:${accent};color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600;font-size:16px">Open MediCare Hub</a>
        <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">If this page opened inside your email app, that's fine — your email is already ${verified ? 'verified' : 'processed'}. You can switch to your browser to sign in.</p>
      </div>
    </div>
  </div>
</body></html>`);
}
