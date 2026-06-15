import { verifyToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';
import db from '../config/database.js';

export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('User not found or inactive');
    }

    req.user = normalizeUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId);
      if (user) {
        req.user = normalizeUser(user);
      }
    }
    next();
  } catch {
    next();
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new UnauthorizedError('Insufficient permissions'));
    }
    next();
  };
}

export function normalizeUser(user) {
  const organisation = user.organisation_id
    ? db.prepare('SELECT * FROM organisations WHERE id = ?').get(user.organisation_id)
    : null;

  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    full_name: `${user.first_name} ${user.last_name}`,
    role: user.role,
    organisation: organisation
      ? {
          id: organisation.id,
          name: organisation.name,
          type: organisation.type,
          registration_number: organisation.registration_number || '',
          tmda_license: organisation.tmda_license || '',
          is_verified: Boolean(organisation.is_verified),
          verified_at: organisation.verified_at,
          created_at: organisation.created_at,
        }
      : null,
    is_active: Boolean(user.is_active),
    is_verified: Boolean(user.is_verified),
    mfa_enabled: Boolean(user.mfa_enabled),
    last_login_ip: user.last_login_ip,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}
