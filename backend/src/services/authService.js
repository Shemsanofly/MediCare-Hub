import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';
import { ValidationError, UnauthorizedError, NotFoundError } from '../utils/errors.js';
import { findUserByEmail, createUser, createOrganisation, findUserById, updateUserLastLogin, updateUserPassword } from '../models/userModel.js';
import { findSupplierByOrganisationId, createSupplier, setSupplierKyc, updateSupplierVerification } from '../models/supplierModel.js';
import { isValidNida, gradeKyc } from './kycService.js';
import { sendPasswordResetEmail, sendVerificationEmail } from './emailService.js';
import { normalizeUser } from '../middleware/auth.js';
import db from '../config/database.js';
import { generateId, nowISO, addDays } from '../utils/helpers.js';

const SALT_ROUNDS = 12;

function hashPassword(password) {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function isStrongPassword(password) {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function registerUser({ email, password, first_name, last_name, role, organisation_name, organisation_type, registration_number, tmda_license, nida_id, kyc_answers }, { enforceKyc = false } = {}) {
  const existing = findUserByEmail(email);
  if (existing) {
    throw new ValidationError('Email already registered');
  }

  if (!isStrongPassword(password)) {
    throw new ValidationError('Password must be at least 8 characters with one uppercase letter, one number, and one special character');
  }

  const validOrgTypes = ['HOSPITAL', 'SUPPLIER', 'PHARMACY', 'LAB'];
  if (!validOrgTypes.includes(organisation_type)) {
    throw new ValidationError('Invalid organisation type');
  }

  // Suppliers must pass simulated NIDA identity verification (KYC) at sign-up.
  let kycVerified = false;
  if (enforceKyc && role === 'SUPPLIER') {
    if (!isValidNida(nida_id)) {
      throw new ValidationError('A valid 20-digit NIDA number is required for supplier registration');
    }
    const result = gradeKyc(nida_id, kyc_answers || {});
    if (!result.passed) {
      throw new ValidationError(`Identity verification failed — you answered ${result.score} of ${result.total} correctly (at least ${result.required} required). Please review and try again.`);
    }
    kycVerified = true;
  }

  const organisation = createOrganisation({
    name: organisation_name,
    type: organisation_type,
    registration_number,
    tmda_license,
    is_verified: role === 'ADMIN',
  });

  const isVerified = role === 'ADMIN';
  const user = createUser({
    email,
    password_hash: hashPassword(password),
    first_name,
    last_name,
    role,
    organisation_id: organisation.id,
    is_verified: isVerified,
    is_staff: role === 'ADMIN',
  });

  // Auto-create supplier profile for supplier registrations
  if (role === 'SUPPLIER') {
    const supplier = createSupplier({
      organisation_id: organisation.id,
      brela_registration_number: registration_number,
      tmda_license_number: tmda_license,
      trust_score: 0,
      verification_status: 'PENDING',
    });
    if (nida_id) {
      setSupplierKyc(supplier.id, {
        nida_number: nida_id,
        kyc_status: kycVerified ? 'VERIFIED' : 'PENDING',
      });
    }
    // Passing NIDA KYC verifies the supplier outright — they (and their
    // products) go live in the marketplace immediately, no admin step.
    if (kycVerified) {
      updateSupplierVerification(supplier.id, {
        verification_status: 'VERIFIED',
        verified_at: nowISO(),
      });
    }
  }

  return normalizeUser(user);
}

export function loginUser({ email, password, ip_address }) {
  const user = findUserByEmail(email);
  if (!user || !user.is_active) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (!verifyPassword(password, user.password_hash)) {
    throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  // Block unverified users from signing in. We do this AFTER the password
  // check on purpose: returning a different error for "this email exists
  // but is unverified" would let an attacker enumerate registered addresses.
  if (!user.is_verified) {
    throw new UnauthorizedError(
      'Please verify your email address before signing in. Check your inbox for the verification link we sent you.',
      'EMAIL_NOT_VERIFIED',
    );
  }

  updateUserLastLogin(user.id, ip_address || null);

  const accessToken = generateAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken({ userId: user.id, tokenVersion: user.updated_at });

  // Store refresh session
  db.prepare(`
    INSERT INTO user_sessions (id, user_id, session_token, ip_address, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(generateId(), user.id, refreshToken, ip_address || null, nowISO(), addDays(nowISO(), 7));

  return {
    access: accessToken,
    refresh: refreshToken,
    user: normalizeUser(findUserById(user.id)),
  };
}

export function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required');
  }

  let decoded;
  try {
    decoded = verifyToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const session = db.prepare('SELECT * FROM user_sessions WHERE session_token = ? AND expires_at > ?').get(refreshToken, nowISO());
  if (!session) {
    throw new UnauthorizedError('Session expired or revoked');
  }

  const user = findUserById(decoded.userId);
  if (!user || !user.is_active) {
    throw new UnauthorizedError('User not found or inactive');
  }

  return generateAccessToken({ userId: user.id, role: user.role });
}

export function logoutUser(refreshToken) {
  if (!refreshToken) return;
  db.prepare('DELETE FROM user_sessions WHERE session_token = ?').run(refreshToken);
}

export function requestPasswordReset(email) {
  const user = findUserByEmail(email);
  if (!user) {
    // Don't reveal whether email exists
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, token_type, created_at, expires_at)
    VALUES (?, ?, ?, 'PASSWORD_RESET', ?, ?)
  `).run(generateId(), user.id, token, nowISO(), addDays(nowISO(), 1));

  void sendPasswordResetEmail(user, token);

  return { token, message: 'If the email exists, a reset link has been sent.' };
}

export function confirmPasswordReset({ token, new_password }) {
  const record = db.prepare(`
    SELECT * FROM auth_tokens
    WHERE token = ? AND token_type = 'PASSWORD_RESET' AND used_at IS NULL AND expires_at > ?
  `).get(token, nowISO());

  if (!record) {
    throw new ValidationError('Invalid or expired reset token');
  }

  if (!isStrongPassword(new_password)) {
    throw new ValidationError('Password must be at least 8 characters with one uppercase letter, one number, and one special character');
  }

  updateUserPassword(record.user_id, hashPassword(new_password));
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').run(nowISO(), record.id);
  db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(record.user_id);

  return { message: 'Password reset successfully' };
}

export function verifyEmail(token) {
  const record = db.prepare(`
    SELECT * FROM auth_tokens
    WHERE token = ? AND token_type = 'EMAIL_VERIFICATION'
  `).get(token);

  if (!record) {
    throw new ValidationError('Invalid or expired verification token');
  }

  const user = findUserById(record.user_id);

  // Idempotent: if this token was already used, clicking the link again (double
  // tap, mail-scanner prefetch, etc.) should still report success as long as the
  // account ended up verified — not an error.
  if (record.used_at) {
    if (user && user.is_verified) {
      return { message: 'Email already verified' };
    }
    throw new ValidationError('Invalid or expired verification token');
  }

  if (new Date(record.expires_at) <= new Date()) {
    throw new ValidationError('Invalid or expired verification token');
  }

  db.prepare('UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?').run(nowISO(), record.user_id);
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').run(nowISO(), record.id);

  return { message: 'Email verified successfully' };
}

export function updateUserProfile(userId, { first_name, last_name }) {
  const user = findUserById(userId);
  if (!user) throw new NotFoundError('User not found');
  db.prepare(`
    UPDATE users SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?
  `).run(first_name ?? user.first_name, last_name ?? user.last_name, nowISO(), userId);
  return normalizeUser(findUserById(userId));
}

export function createEmailVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, code, token_type, created_at, expires_at)
    VALUES (?, ?, ?, ?, 'EMAIL_VERIFICATION', ?, ?)
  `).run(generateId(), userId, token, code, nowISO(), addDays(nowISO(), 1));
  return { token, code };
}

/** Verify an email using the short 6-digit code (alternative to the link). */
export function verifyEmailCode(email, code) {
  const user = findUserByEmail(email);
  if (!user) throw new ValidationError('Invalid or expired verification code');
  if (user.is_verified) return { message: 'Email already verified' };

  const record = db.prepare(`
    SELECT * FROM auth_tokens
    WHERE user_id = ? AND token_type = 'EMAIL_VERIFICATION' AND code = ?
      AND used_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(user.id, String(code).trim(), nowISO());

  if (!record) {
    throw new ValidationError('Invalid or expired verification code');
  }

  db.prepare('UPDATE users SET is_verified = 1, updated_at = ? WHERE id = ?').run(nowISO(), user.id);
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE id = ?').run(nowISO(), record.id);

  return { message: 'Email verified successfully' };
}

/**
 * Resend the verification email. Mirrors the password-reset flow: we always
 * return the same opaque "we've sent it" message whether the email exists,
 * already-verified, or not — so callers can't enumerate registered addresses.
 */
export function resendVerificationEmail(email) {
  const user = findUserByEmail(email);
  if (!user || user.is_verified) {
    return { message: 'If the email exists and is not yet verified, a verification link has been sent.' };
  }

  // Keep previously-issued verification links/codes valid (until they expire).
  // Resends can fail to deliver (e.g. SMTP throttling), so invalidating the old
  // ones would leave a user with no working code — every emailed code stays
  // usable until expiry or first use.
  const { token, code } = createEmailVerificationToken(user.id);
  void sendVerificationEmail(user, token, code);

  return { message: 'If the email exists and is not yet verified, a verification link has been sent.' };
}
