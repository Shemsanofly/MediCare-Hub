import db from '../config/database.js';
import { generateId, nowISO } from '../utils/helpers.js';

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function findOrganisationById(id) {
  return db.prepare('SELECT * FROM organisations WHERE id = ?').get(id);
}

export function createUser({ email, password_hash, first_name, last_name, role, organisation_id, is_verified = false, is_staff = false }) {
  const id = generateId();
  const created = nowISO();
  db.prepare(`
    INSERT INTO users (id, email, password_hash, first_name, last_name, role, organisation_id, is_verified, is_staff, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email, password_hash, first_name, last_name, role, organisation_id, is_verified ? 1 : 0, is_staff ? 1 : 0, created, created);
  return findUserById(id);
}

export function createOrganisation({ name, type, registration_number, tmda_license, is_verified = false }) {
  const id = generateId();
  const verified_at = is_verified ? nowISO() : null;
  db.prepare(`
    INSERT INTO organisations (id, name, type, registration_number, tmda_license, is_verified, verified_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, type, registration_number || null, tmda_license || null, is_verified ? 1 : 0, verified_at, nowISO());
  return findOrganisationById(id);
}

export function updateUserLastLogin(id, ip) {
  db.prepare('UPDATE users SET last_login_ip = ?, updated_at = ? WHERE id = ?').run(ip, nowISO(), id);
}

export function setUserActive(id, isActive) {
  db.prepare('UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?').run(isActive ? 1 : 0, nowISO(), id);
  return findUserById(id);
}

export function setUserVerified(id, isVerified) {
  db.prepare('UPDATE users SET is_verified = ?, updated_at = ? WHERE id = ?').run(isVerified ? 1 : 0, nowISO(), id);
  return findUserById(id);
}

export function updateUserPassword(id, password_hash) {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(password_hash, nowISO(), id);
}

export function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}
